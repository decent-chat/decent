const express = require('express')
const bodyParser = require('body-parser')
const multer = require('multer')
const shortid = require('shortid')
const uuidv4 = require('uuid/v4')
const fs = require('fs')
const path = require('path')
const util = require('util')
const bcrypt = require('./bcrypt-util')
const crypto = require('crypto')
const memoize = require('memoizee')
const { makeMiddleware, validate } = require('./middleware')

const mkdir = util.promisify(fs.mkdir)

const {
  serverSettingsID, serverPropertiesID, setSetting,
} = require('./settings')
const errors = require('./errors')

const DB_IN_MEMORY = Symbol()

module.exports = async function attachAPI(app, {wss, db, dbDir}) {
  const { middleware, util: {
    getUserIDBySessionID,
    getUserBySessionID
  } } = makeMiddleware({db})

  // Used to keep track of connected clients and related data, such as
  // session IDs.
  const connectedSocketsMap = new Map()

  const sendToAllSockets = function(evt, data, sendToUnauthorized = false) {
    for (const [ socket, socketData ] of connectedSocketsMap.entries()) {
      // Only send data to authorized sockets - those are sockets who've been
      // verified as having logged in as an actual member (and not an
      // unauthorized user).
      if (sendToUnauthorized || socketData.authorized === true) {
        socket.send(JSON.stringify({ evt, data }))
      }
    }
  }

  const md5 = string => {
    if (!string) {
      throw 'md5() was not passed ' + string
    }

    return crypto.createHash('md5').update(string).digest('hex')
  }

  const emailToAvatarURL = memoize(email =>
    `https://seccdn.libravatar.org/avatar/${email ? md5(email) : ''}?d=retro`)

  const announceUserOffline = async function(userID) {
    // Announces that a user has gone offline.

    // We only want to announce that the user is offline if there are no
    // sockets that say the user is online.
    if (userID && await isUserOnline(userID) === false) {
      // console.log('\x1b[36mOffline:', userID, '\x1b[0m')
      sendToAllSockets('user/offline', {userID})
    }
  }

  const announceUserOnline = async function(userID) {
    // Same deal as announcing offline, but for going online instead.

    // Only announce they're online if they weren't already online!
    if (userID && await isUserOnline(userID) === false) {
      // console.log('\x1b[36mOnline:', userID, '\x1b[0m')
      sendToAllSockets('user/online', {userID})
    }
  }

  const shouldUseAuthorization = async function() {
    const { requireAuthorization } = await db.settings.findOne({_id: serverPropertiesID})

    return requireAuthorization === 'on'
  }

  const isUserOnline = async function(userID) {
    // Simple logic: a user is online iff there is at least one socket whose
    // session belongs to that user.

    return Array.from(connectedSocketsMap.values())
      .some(socketData => socketData.userID === userID)
  }

  const isUserAuthorized = async function(userID) {
    // Checks if a user is authorized. If authorization is disabled, this will
    // always return true (even if the "authorized" field is set to false).

    if (await shouldUseAuthorization() === false) {
      return true
    }

    const user = await db.users.findOne({_id: userID})

    return user && user.authorized ? true : false
  }

  const markChannelAsRead = async function(userID, channelID) {
    await db.users.update({_id: userID}, {
      $set: {
        [`lastReadChannelDates.${channelID}`]: Date.now()
      }
    })
  }

  const getUnreadMessageCountInChannel = async function(userObj, channelID) {
    let date = 0
    const { lastReadChannelDates } = userObj
    if (lastReadChannelDates) {
      if (channelID in lastReadChannelDates) {
        date = lastReadChannelDates[channelID]
      }
    }

    const cursor = db.messages.ccount({
      date: {$gt: date},
      channelID
    }).limit(200)
    const count = await cursor.exec()

    return count
  }

  const loadVarsFromRequestObject = function(object, request, response, next) {
    // TODO: Actually implement the variable system..!
    request[middleware.vars] = {}

    for (const [ key, value ] of Object.entries(object)) {
      request[middleware.vars][key] = value
    }

    next()
  }

  const serialize = {
    message: async m => ({
      id: m._id,
      authorUsername: m.authorUsername,
      authorID: m.authorID,
      authorAvatarURL: emailToAvatarURL(m.authorEmail || m.authorID),
      text: m.text,
      date: m.date,
      editDate: m.editDate,
      channelID: m.channelID,
      reactions: m.reactions
    }),

    user: async (u, sessionUser = null) => {
      const obj = {
        id: u._id,
        username: u.username,
        avatarURL: emailToAvatarURL(u.email || u._id),
        permissionLevel: u.permissionLevel,
        online: await isUserOnline(u._id)
      }

      if (sessionUser && sessionUser._id === u._id) {
        obj.email = u.email || null

        if (await shouldUseAuthorization()) {
          obj.authorized = u.authorized || false
        }
      }

      return obj
    },

    sessionBrief: async s => ({
      id: s._id,
      dateCreated: s.dateCreated
    }),

    sessionDetail: async s => {
      const user = await getUserBySessionID(s._id)

      return Object.assign(await serialize.sessionBrief(s), {
        user: await serialize.user(user, user)
      })
    },

    channelBrief: async (c, sessionUser = null) => {
      const obj = {
        id: c._id,
        name: c.name
      }

      if (sessionUser) {
        obj.unreadMessageCount = await getUnreadMessageCountInChannel(sessionUser, c._id)
      }

      return obj
    },

    // Extra details for a channel - these aren't returned in the channel list API,
    // but are when a specific channel is fetched.
    channelDetail: async (c, sessionUser = null) => {
      let pinnedMessages = await Promise.all(c.pinnedMessageIDs.map(id => db.messages.findOne({_id: id})))

      // Null messages are filtered out, just in case there's a broken message ID in the
      // pinned message list (e.g. because a message was deleted).
      pinnedMessages = pinnedMessages.filter(Boolean)

      pinnedMessages = await Promise.all(pinnedMessages.map(serialize.message))

      return Object.assign(await serialize.channelBrief(c, sessionUser), {
        pinnedMessages
      })
    }
  }

  app.use(bodyParser.json())

  app.use(['/api/*', '/api'], async (request, response, next) => {
    response.header('Content-Type', 'application/json')
    response.header('Access-Control-Allow-Origin', '*')
    response.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')

    next()
  })

  // Don't let users who aren't verified (authorized false) interact with
  // most API endpoints.
  app.use('/api', [
    ...middleware.verifyVarsExists(),

    // Users should still be able to log in, though, obviously - otherwise,
    // they'll never have a session ID (and tied user) for the server to
    // check! (By the way, Express automatically gets rid of the "/api/"
    // part, so we can just check for /login instead of /api/login.)
    // A couple other endpoints also don't make sense to verify, so we skip
    // those.
    async (request, response, next) => {
      // Although, of course, we should only do any of this if the server is
      // set to require authorization!
      const { requireAuthorization } = await db.settings.findOne({_id: serverPropertiesID})

      if (requireAuthorization === 'on' && !(
        [
          '/login', '/register',
          '/delete-sessions', '/user-session-list',
          '/should-use-secure', '/should-use-authorization',
          '/' // "This is a Decent server..."
        ].includes(request.path) ||

        // /session/:sessionID should work.
        request.path.startsWith('/session/')
      )) {
        request[middleware.vars].shouldVerify = true
      }

      next()
    },

    (request, response, next) => {
      // First we check the POST body for the session ID (if it's a POST
      // request). If we don't find anything, we check the query URL, then
      // the headers (X-Session-ID). If we still don't find a session ID and
      // one is required - shouldVerify - we'll say none was given
      // and prevent the user from proceeding.
      //
      // See the 'authorization' section in the API docs.
      let sessionID
      if (request.method === 'POST' && 'sessionID' in request.body) {
        sessionID = request.body.sessionID
      } else if ('sessionID' in request.query) {
        sessionID = request.query.sessionID
      } else if ('x-session-id' in request.headers) {
        sessionID = request.headers['x-session-id'] // All headers are lowercase.
      } else if (request[middleware.vars].shouldVerify) {
        // No session ID given - just quit here.
        response.status(403).end(JSON.stringify({
          error: errors.AUTHORIZATION_ERROR
        }))
        return
      }

      if (sessionID) {
        // We'll save the session ID as a middleware-var so we can use it
        // in the upcoming requests.
        Object.assign(request[middleware.vars], {sessionID})

        // Note we don't set sessionID at all if it's undefined - runIfVarExists
        // takes even undefined values to "exist", and we don't want that.
      }

      next()
    },

    ...middleware.runIfVarExists('shouldVerify', [
      // No need to rewrite the wheel - we have a fancy way of guessing where
      // we might get the session ID, but we can use it just like we always
      // do (with our normal middleware functions).
      ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

      (request, response, next) => {
        // Now that we have the session user, we can actually check if the user
        // is authorized. For now, we just check if the user's permission
        // level is "admin" or "member", but in the future (TODO) we should have
        // a more sophisticated (and not hard-coded!) setup for permissions.
        const { sessionUser } = request[middleware.vars]

        if (sessionUser.authorized === true) {
          next()
        } else {
          response.status(403).end(JSON.stringify({
            error: errors.AUTHORIZATION_ERROR
          }))
        }
      }
    ])
  ])

  app.get('/api/', (request, response) => {
    // We use HTTP 418 (I'm a teapot) unironically here because
    // no other /api/ is likely to return it, so it can be a quick
    // check for is-this-a-decent-server.
    response.status(418).end(JSON.stringify({
      // The client's 'add server' implementation should check for the
      // presence of this property to check if it's actually talking to
      // a Decent server like this one.
      decent: true,

      // For people viewing the API manually for whatever reason to have
      // something to reference, we provide some info about the server itself.
      message: `This is a Decent chat server. See the repo for details.`,
      repository: 'https://github.com/decent-chat/decent',
    }))
  })

  if (dbDir === DB_IN_MEMORY) {
    // If the database is in-memory we have nowhere to store uploads, so we'll
    // just reject them instead.
    app.post('/api/upload-image', (request, response) => {
      response.status(500).end(JSON.stringify({
        error: errors.UPLOADS_DISABLED
      }))
    })
  } else {
    const upload = multer({
      limits: {
        files: 1, fileSize: 1e7 // 10 megabytes
      },

      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const path = dbDir + '/uploads/' + shortid()
          const dir = __dirname + path

          req[middleware.vars].path = path

          mkdir(dir)
            .then(() => cb(null, dir))
            .catch(error => cb(error))
        },

        filename: (req, file, cb) => {
          let ext
          switch (file.mimetype) {
            case 'image/gif': ext = 'gif'; break
            case 'image/jpeg': ext = 'jpeg'; break
            case 'image/png': ext = 'png'; break
            default: cb(new Error('invalid MIME type')); return
          }

          const name = file.originalname || 'image'
          const basename = path.basename(name, path.extname(name))
          const filename = `${basename}.${ext}`

          req[middleware.vars].path += '/' + filename
          cb(null, filename)
        }
      })
    })
    const uploadSingleImage = upload.single('image')

    // TODO: delete old images
    app.post('/api/upload-image', [
      ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
      //...middleware.requireBeAdmin('sessionUser'),
      (req, res) => uploadSingleImage(req, res, err => {
        if (err) {
          res.status(500).end(JSON.stringify({
            error: Object.assign({}, errors.UPLOAD_FAILED, {message: err.message})
          }))
        } else {
          const { path } = req[middleware.vars]
          res.status(200).end(JSON.stringify({
            path
          }))
        }
      })
    ])
  }

  app.get('/api/settings', [
    async (request, response) => {
      const serverSettings = await db.settings.findOne({_id: serverSettingsID})

      delete serverSettings._id

      response.status(200).end(JSON.stringify({
        settings: serverSettings
      }))
    }
  ])

  app.patch('/api/settings', [
    ...middleware.loadVarFromBody('patch'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),

    async (request, response) => {
      const { patch } = request[middleware.vars]

      const serverSettings = await db.settings.findOne({_id: serverSettingsID})

      const results = {}

      for (const [ key, value ] of Object.entries(patch)) {
        results[key] = await setSetting(db.settings, serverSettingsID, key, value)
      }

      response.status(200).end(JSON.stringify({results}))
    }
  ])

  app.get('/api/properties', [
    async (request, response) => {
      const { https } = await db.settings.findOne({_id: serverPropertiesID})
      const useAuthorization = await shouldUseAuthorization()

      response.status(200).end(JSON.stringify({
        properties: {
          useSecure: https === 'on' ? true : false,
          useAuthorization
        }
      }))
    }
  ])

  app.post('/api/messages', [
    ...middleware.loadVarFromBody('text'),
    ...middleware.validateVar('text', validate.string),
    ...middleware.loadVarFromBody('channelID'),
    ...middleware.validateVar('channelID', validate.string),
    ...middleware.getChannelFromID('channelID', '_'), // To verify that it exists.
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    async (request, response) => {
      const { text, channelID, sessionUser } = request[middleware.vars]

      const message = await db.messages.insert({
        authorID: sessionUser._id,
        authorUsername: sessionUser.username,
        authorEmail: sessionUser.email,
        text: request.body.text,
        date: Date.now(),
        editDate: null,
        channelID: channelID,
        reactions: {}
      })

      sendToAllSockets('message/new', {
        message: await serialize.message(message)
      })

      // Sending a message should also mark the channel as read for that user:
      await markChannelAsRead(sessionUser._id, channelID)

      response.status(201).end(JSON.stringify({
        messageID: message._id
      }))
    }
  ])

  app.post('/api/pin-message', [
    ...middleware.loadVarFromBody('messageID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.getMessageFromID('messageID', 'message'),
    (req, res, next) => {
      const v = req[middleware.vars]
      v.channelID = v.message.channelID
      next()
    },
    ...middleware.getChannelFromID('channelID', 'channel'),

    async (request, response) => {
      const { messageID, channel } = request[middleware.vars]

      if (channel.pinnedMessageIDs.includes(messageID)) {
        response.status(500).end(JSON.stringify({
          error: errors.ALREADY_PERFORMED
        }))

        return
      }

      await db.channels.update({_id: channel._id}, {
        $push: {
          pinnedMessageIDs: messageID
        }
      })

      response.status(200).end(JSON.stringify({}))
    }
  ])

  app.post('/api/add-message-reaction', [
    ...middleware.loadVarFromBody('reactionCode'),
    ...middleware.loadVarFromBody('messageID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.getMessageFromID('messageID', 'message'),

    async (request, response) => {
      const { reactionCode, message, sessionUser: { _id: userID } } = request[middleware.vars]

      let newReactionCount

      if (reactionCode in message.reactions) {
        if (message.reactions[reactionCode].includes(userID)) {
          response.status(500).end(JSON.stringify({
            error: errors.ALREADY_PERFORMED
          }))

          return
        }

        const [ numAffected, newMessage ] = await db.messages.update({_id: message._id}, {
          $push: {
            [`reactions.${reactionCode}`]: userID
          }
        }, {
          multi: false,
          returnUpdatedDocs: true
        })

        newReactionCount = newMessage.reactions[reactionCode].length
      } else {
        await db.messages.update({_id: message._id}, {
          $set: {
            [`reactions.${reactionCode}`]: [userID]
          }
        })

        newReactionCount = 1
      }

      response.status(200).end(JSON.stringify({
        newCount: newReactionCount
      }))
    }
  ])

  app.post('/api/edit-message', [
    ...middleware.loadVarFromBody('messageID'),
    ...middleware.loadVarFromBody('text'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.getMessageFromID('messageID', 'oldMessage'),
    ...middleware.requireBeMessageAuthor('oldMessage', 'sessionUser'),

    async (request, response) => {
      const { text, oldMessage, sessionUser: { _id: userID } } = request[middleware.vars]

      if (userID !== oldMessage.authorID) {
        response.status(403).end(JSON.stringify({
          error: errors.NOT_YOURS
        }))

        return
      }

      const [ numAffected, newMessage ] = await db.messages.update({_id: oldMessage._id}, {
        $set: {
          text,
          editDate: Date.now()
        }
      }, {
        multi: false,
        returnUpdatedDocs: true
      })

      sendToAllSockets('message/edit', {message: await serialize.message(newMessage)})

      response.status(200).end(JSON.stringify({}))
    }
  ])

  app.post('/api/delete-message', [
    ...middleware.loadVarFromBody('messageID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.getMessageFromID('messageID', 'message'),

    async (request, response) => {
      const { message, sessionUser } = request[middleware.vars]

      if (sessionUser._id !== message.authorID) {
        if (sessionUser.permissionLevel !== 'admin') {
          response.status(403).end(JSON.stringify({
            error: errors.NOT_YOURS
          }))

          return
        }
      }

      await db.messages.remove({_id: message._id})

      // We don't want to send back the message itself, obviously!
      sendToAllSockets('message/delete', {messageID: message._id})

      response.status(200).end(JSON.stringify({}))
    }
  ])

  app.get('/api/message/:messageID', [
    ...middleware.loadVarFromParams('messageID'),
    ...middleware.getMessageFromID('messageID', 'message'),

    async (request, response) => {
      const { message } = request[middleware.vars]

      response.status(200).end(JSON.stringify({
        message: await serialize.message(message)
      }))
    }
  ])

  app.post('/api/channels', [
    ...middleware.loadVarFromBody('name'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.requireNameValid('name'),

    async (request, response) => {
      const { name } = request[middleware.vars]

      if (await db.channels.findOne({name})) {
        response.status(500).end(JSON.stringify({
          error: errors.NAME_ALREADY_TAKEN
        }))

        return
      }

      const channel = await db.channels.insert({
        name,
        pinnedMessageIDs: []
      })

      sendToAllSockets('channel/new', {
        channel: await serialize.channelDetail(channel),
      })

      response.status(201).end(JSON.stringify({
        channelID: channel._id
      }))
    }
  ])

  app.post('/api/rename-channel', [
    ...middleware.loadVarFromBody('channelID'),
    ...middleware.loadVarFromBody('name'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.requireNameValid('name'),
    ...middleware.getChannelFromID('channelID', '_'), // To verify the channel exists.

    async (request, response) => {
      const { channelID, name } = request[middleware.vars]

      if (await db.channels.findOne({name})) {
        response.status(400).end(JSON.stringify({
          error: errors.NAME_ALREADY_TAKEN
        }))

        return
      }

      await db.channels.update({_id: channelID}, {$set: {name}})

      sendToAllSockets('channel/rename', {
        channelID, newName: name
      })

      response.status(200).end(JSON.stringify({}))
    }
  ])

  app.post('/api/delete-channel', [
    ...middleware.loadVarFromBody('channelID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.getChannelFromID('channelID', '_'), // To verify the channel exists.

    async (request, response) => {
      const { channelID } = request[middleware.vars]

      // Delete the channel AND any messages contained in it.
      await Promise.all([
        db.channels.remove({_id: channelID}),
        db.messages.remove({channelID}, {multi: true})
      ])

      // Only send the channel ID, since that's all that's needed.
      sendToAllSockets('channel/delete', {
        channelID
      })

      response.status(200).end(JSON.stringify({}))
    }
  ])

  app.get('/api/channel/:channelID', [
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.getChannelFromID('channelID', 'channel'),
    ...middleware.runIfVarExists('sessionID',
      middleware.getSessionUserFromID('sessionID', 'sessionUser')
    ),

    async (request, response) => {
      const { channel, sessionUser } = request[middleware.vars]

      response.status(200).end(JSON.stringify({
        channel: await serialize.channelDetail(channel, sessionUser)
      }))
    }
  ])

  app.get('/api/channel-list', [
    ...middleware.runIfVarExists('sessionID',
      middleware.getSessionUserFromID('sessionID', 'sessionUser')
    ),

    async (request, response) => {
      const { sessionUser } = request[middleware.vars]

      const channels = await db.channels.find({})

      response.status(200).end(JSON.stringify({
        channels: await Promise.all(channels.map(channel => {
          return serialize.channelBrief(channel, sessionUser)
        }))
      }))
    }
  ])

  app.get('/api/channel/:channelID/latest-messages', [
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.loadVarFromQuery('before', false),
    ...middleware.loadVarFromQuery('after', false),
    ...middleware.loadVarFromQuery('limit', false),
    ...middleware.getChannelFromID('channelID', '_'), // Just to make sure the channel exists
    ...middleware.runIfVarExists('before',
      middleware.getMessageFromID('before', 'beforeMessage')
    ),
    ...middleware.runIfVarExists('after',
      middleware.getMessageFromID('after', 'afterMessage')
    ),

    async (request, response) => {
      const { channelID, beforeMessage, afterMessage, limit } = request[middleware.vars]

      const query = {channelID}

      if (beforeMessage || afterMessage) {
        query.date = {}

        if (beforeMessage) {
          query.date.$lt = beforeMessage.date
        }

        if (afterMessage) {
          query.date.$gt = afterMessage.date
        }
      }

      const sort = {date: -1}

      if (afterMessage && !beforeMessage) {
        sort.date = +1
      }

      // We sort the messages by NEWEST date ({date: -1}), so that we're returned
      // the newest messages, but then we reverse the array, so that the actual
      // data returned from the API is sorted by oldest first. (This is so that
      // appending message elements is easier.)

      // TODO: If there is more than 50, show that somehow.
      // TODO: Store 50 as a constant somewhere?
      const cursor = db.messages.cfind(query)
      cursor.sort(sort)
      cursor.limit(limit ? Math.max(1, Math.min(50, parseInt(limit))) : 50)
      const messages = await cursor.exec()
      if (sort.date === -1) {
        messages.reverse()
      }

      response.status(200).end(JSON.stringify({
        messages: await Promise.all(messages.map(serialize.message))
      }))
    }
  ])

  app.post('/api/mark-channel-as-read', [
    ...middleware.loadVarFromBody('channelID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.getChannelFromID('channelID', '_'), // To verify that it exists

    async (request, response) => {
      const { sessionUser, channelID } = request[middleware.vars]

      await markChannelAsRead(sessionUser._id, channelID)

      response.status(200).end(JSON.stringify({}))
    }
  ])

  app.get('/api/channel-is-read', [
    ...middleware.loadVarFromQuery('channelID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    async (request, response) => {
      const { channelID, sessionUser } = request[middleware.vars]

      const count = await getUnreadMessageCountInChannel(sessionUser, channelID)

      response.status(200).end(JSON.stringify({
        count
      }))
    }
  ])

  app.post('/api/register', [
    ...middleware.loadVarFromBody('username'),
    ...middleware.loadVarFromBody('password'),
    ...middleware.requireNameValid('username'),

    async (request, response) => {
      const { username, password } = request[middleware.vars]

      if (await db.users.findOne({username})) {
        response.status(500).end(JSON.stringify({
          error: errors.NAME_ALREADY_TAKEN
        }))

        return
      }

      if (password.length < 6) {
        response.status(400).end(JSON.stringify({
          error: errors.SHORT_PASSWORD
        }))

        return
      }

      const salt = await bcrypt.genSalt()
      const passwordHash = await bcrypt.hash(password, salt)

      const user = await db.users.insert({
        username,
        passwordHash, salt,
        email: null,
        permissionLevel: 'member',
        authorized: false,
        lastReadChannelDates: {}
      })

      response.status(201).end(JSON.stringify({
        user: await serialize.user(user)
      }))
    }
  ])

  app.get('/api/user/:userID', [
    ...middleware.loadVarFromParams('userID'),

    async (request, response) => {
      const { userID } = request[middleware.vars]

      const user = await db.users.findOne({_id: userID})

      if (!user) {
        response.status(404).end(JSON.stringify({
          error: errors.NOT_FOUND
        }))

        return
      }

      response.status(200).end(JSON.stringify({
        user: await serialize.user(user)
      }))
    }
  ])

  app.post('/api/account-settings', [
    ...middleware.loadVarFromBody('email'),
    ...middleware.getSessionUserFromID('sessionID', 'user'),

    async (request, response) => {
      const { email, user } = request[middleware.vars]

      await db.users.update({ _id: user._id }, {
        $set: {
          email,
        }
      })

      response.status(200).end(JSON.stringify({
        avatarURL: emailToAvatarURL(email),
      }))
    }
  ])

  app.get('/api/user-list', [
    ...middleware.runIfCondition(() => shouldUseAuthorization(), [
      async (request, response) => {
        const { sessionUser } = request[middleware.vars]
        const isAdmin = sessionUser && sessionUser.permissionLevel === 'admin'

        const [ authorizedUsers, unauthorizedUsers ] = await Promise.all([
          db.users.find({authorized: true}),

          // Unauthorized users - anyone where authorized is false,
          // or authorized just isn't set at all (e.g. an old database).
          isAdmin
            ? db.users.find({$or: [
              {authorized: false},
              {authorized: {$exists: false}}
            ]})
            : Promise.resolve(null)
        ])

        const result = {
          users: await Promise.all(authorizedUsers.map(serialize.user))
        }

        // Respond the unauthorized users in a separate field, but only if the
        // session user is an admin.
        if (isAdmin) {
          result.unauthorizedUsers = await Promise.all(
            unauthorizedUsers.map(serialize.user)
          )
        }

        response.status(200).end(JSON.stringify(result))
      }
    ], [
      // If authorization is disabled we can take a far simpler route - just
      // return every user.
      async (request, response) => {
        const users = await db.users.find({})

        response.status(200).end(JSON.stringify({
          users: await Promise.all(users.map(serialize.user))
        }))
      }
    ])
  ])

  app.get('/api/username-available/:username', [
    ...middleware.loadVarFromParams('username'),

    async (request, response) => {
      const { username } = request[middleware.vars]

      const user = await db.users.findOne({username})

      if (user) {
        response.status(200).end(JSON.stringify({
          available: false
        }))
      } else {
        response.status(200).end(JSON.stringify({
          available: true
        }))
      }
    }
  ])

  app.post('/api/login', [
    ...middleware.loadVarFromBody('username'),
    ...middleware.loadVarFromBody('password'),
    ...middleware.getUserFromUsername('username', 'user'),

    async (request, response) => {
      const { username, password, user } = request[middleware.vars]
      const { salt, passwordHash } = user

      if (await bcrypt.compare(password, passwordHash)) {
        const session = await db.sessions.insert({
          _id: uuidv4(),
          userID: user._id,
          dateCreated: Date.now()
        })

        response.status(200).end(JSON.stringify({
          sessionID: session._id
        }))
      } else {
        response.status(401).end(JSON.stringify({
          error: errors.INCORRECT_PASSWORD
        }))
      }
    }
  ])

  app.get('/api/session/:sessionID', [
    ...middleware.loadVarFromParams('sessionID'),

    async (request, response) => {
      const { sessionID } = request[middleware.vars]

      const session = await db.sessions.findOne({_id: sessionID})

      if (!session) {
        response.status(404).end(JSON.stringify({
          error: errors.NOT_FOUND
        }))

        return
      }

      response.status(200).end(JSON.stringify({
        session: await serialize.sessionDetail(session)
      }))
    }
  ])

  const authUserMiddleware = [
    async function(request, response, next) {
      if (await shouldUseAuthorization()) {
        next()
      } else {
        response.status(400).end(JSON.stringify({
          error: errors.AUTHORIZATION_ERROR
        }))
      }
    },

    ...middleware.loadVarFromBody('userID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.getUserFromID('userID', '_')
  ]

  app.post('/api/authorize-user', [
    ...authUserMiddleware,

    async function(request, response) {
      const { userID } = request[middleware.vars]

      await db.users.update({_id: userID}, {
        $set: {authorized: true}
      })

      response.status(200).end(JSON.stringify({}))
    }
  ])

  app.post('/api/deauthorize-user', [
    ...authUserMiddleware,

    async function(request, response) {
      const { userID, sessionUser } = request[middleware.vars]

      if (sessionUser._id === userID) {
        response.status(400).end(JSON.stringify({
          error: Object.assign({}, errors.AUTHORIZATION_ERROR, {
            message: 'You can\'t deauthorize yourself.'
          })
        }))

        return
      }

      await db.users.update({_id: userID}, {
        $set: {authorized: false}
      })

      response.status(200).end(JSON.stringify({}))
    }
  ])

  app.post('/api/delete-sessions', [
    ...middleware.loadVarFromBody('sessionIDs'),

    // No verification ("are you the owner of this session ID" etc), because
    // if you know the session ID, you obviously have power over it!

    async (request, response) => {
      const { sessionIDs } = request[middleware.vars]

      if (!(Array.isArray(sessionIDs) && sessionIDs.every(x => typeof x === 'string'))) {
        response.status(400).end(JSON.stringify({
          error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'Expected sessionIDs to be an array of strings.'
          })
        }))
      } else {
        await Promise.all(sessionIDs.map(
          sid => db.sessions.remove({_id: sid})
        ))

        response.status(200).end(JSON.stringify({}))
      }
    }
  ])

  app.get('/api/user-session-list', [
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    async (request, response) => {
      const { sessionUser } = request[middleware.vars]

      const sessions = await db.sessions.find({userID: sessionUser._id})

      response.status(200).end(JSON.stringify({
        sessions: await Promise.all(sessions.map(serialize.sessionBrief))
      }))
    }
  ])

  app.use(['/api/*', '/api'], async (error, request, response, next) => {
    // console.error('\x1b[31m' + error.message + '\x1b[2m\n' + error.stack + '\x1b[0m')

    response.status(500).end(JSON.stringify({
      error: Object.assign(errors.INTERNAL_ERROR, {
        message: error.message,
        stack: error.stack
      })
    }))
  })

  wss.on('connection', socket => {
    const socketData = {
      sessionID: null,
      authorized: false,
      isAlive: true,
    }

    connectedSocketsMap.set(socket, socketData)

    socket.on('message', async message => {
      let messageObj
      try {
        messageObj = JSON.parse(message)
      } catch(err) {
        return
      }

      const { evt, data } = messageObj

      if (evt === 'pongdata') {
        // Not the built-in pong; this event is used for gathering
        // socket-specific data.
        if (!data) {
          return
        }

        const { sessionID } = data

        // sessionID should be either a string or null. We'll make sure that
        // the session ID actually exists, but only when it's changed.
        if (typeof sessionID !== 'string' && sessionID !== null) {
          return
        }

        if (sessionID !== socketData.sessionID) {
          socketData.sessionID = sessionID

          // Announce the user is offline. We need to set the socket's
          // userID to null so that isUserOnline does not see the socket
          // and decide that the user must still be online.
          const oldUserID = socketData.userID
          socketData.userID = null
          await announceUserOffline(oldUserID)

          // Announce the user of the *new* sessionID as being online. We have
          // to set userID AFTER announcing the user is online, or else
          // isUserOnline will see that the user was already online before
          // calling announceUserOnline (so announceUserOnline won't do
          // anything).
          const newUserID = await getUserIDBySessionID(sessionID)
          await announceUserOnline(newUserID)
          socketData.userID = newUserID

          if (await shouldUseAuthorization()) {
            const user = await getUserBySessionID(sessionID)

            if (!user) {
              socketData.sessionID = null
              socketData.userID = null
              socketData.authorized = false
              return
            }

            if (user.authorized === true) {
              socketData.authorized = true
            } else {
              socketData.authorized = false
            }
          } else {
            socketData.authorized = true
          }
        }
      }
    })

    // Built-in pong - not the pong event.
    socket.on('pong', () => {
      // Pong!
      Object.assign(connectedSocketsMap.get(socket), {
        isAlive: true
      })
    })

    socket.on('close', async () => {
      const socketData = connectedSocketsMap.get(socket)
      connectedSocketsMap.delete(socket)
      await announceUserOffline(socketData.userID)
    })

    // Immediately send out a ping for data event; this will fill in important
    // data (like the session ID) for the socket as soon as possible. Without this
    // we wait for the next ping, which is an unwanted delay (e.g. it would make
    // detecting the user being online be delayed by up to 10 seconds).
    socket.send(JSON.stringify({evt: 'pingdata'}))
  })

  setInterval(async () => {
    // Prune dead socket connections, and ping all
    // other sockets to check they're still alive.
    for (const [ socket, socketData ] of connectedSocketsMap) {
      if (!socketData.isAlive) {
        // R.I.P.
        socket.terminate()
        connectedSocketsMap.delete(socket)
        await announceUserOffline(socketData.userID)
      } else {
        // Ping!
        socketData.isAlive = false
        connectedSocketsMap.set(socket, socketData)

        socket.ping('', false, true)

        // The built-in socket ping method is great for obliterating dead sockets,
        // but we also want to detect data, so we need to send out a normal 'ping'
        // event at the same time, which the client can detect and respond to.
        socket.send(JSON.stringify({evt: 'pingdata'}))
      }
    }
  }, 10 * 1000) // Every 10s.

  const pruneOldSessions = async function() {
    // Remove old sessions - any that are at least 30 days old.

    const maximumLifetime = 30 * 24 * 60 * 60 * 1000

    await db.sessions.remove({
      $where: function() {
        return Date.now() - this.dateCreated > maximumLifetime
      }
    }, {multi: true})
  }

  setInterval(pruneOldSessions, 5 * 60 * 1000) // Every 5min.
  pruneOldSessions()
}

Object.assign(module.exports, { DB_IN_MEMORY })
