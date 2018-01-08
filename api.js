// TODO: Resources. When a resource is sent back to the client, it is sent in a
// serialized form - for example, a User resource might serialize to not include
// the password hash or salt fields. (NOTE: Resources DO NOT have to be JavaScript
// objects! It could be as simple as defining "serialize" functions for each type
// of resource, e.g. serializeUser.)

// TODO: Parameters. When defining an API endpoint, parameters can be specified.
// These may be automatically processed - for example, a sessionID parameter could
// automatically be turned into a user object fetched from the database, and, if
// that user object is not found, it could automatically prevent the API request
// from continuing.

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

const mkdir = util.promisify(fs.mkdir)

const {
  serverSettingsID, serverPropertiesID, setSetting,
} = require('./settings')

module.exports = async function attachAPI(app, {wss, db}) {
  // Used to keep track of connected clients and related data, such as
  // session IDs.
  const connectedSocketsMap = new Map()

  // The olde General Valid Name regex. In the off-chance it's decided that
  // emojis should be allowed (or whatever) in channel/user/etc names, this
  // regex can be updated.
  const isNameValid = name => /^[a-zA-Z0-9_-]+$/g.test(name)

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

  const getUserBySessionID = async function(sessionID) {
    const session = await db.sessions.findOne({_id: sessionID})

    if (!session) {
      return null
    }

    const user = await db.users.findOne({_id: session.userID})

    if (!user) {
      return null
    }

    return user
  }

  const shouldUseAuthorization = async function() {
    const { requireAuthorization } = await db.settings.findOne({_id: serverPropertiesID})

    return requireAuthorization === 'on'
  }

  const isUserOnline = async function(userID) {
    // Simple logic: a user is online iff there is at least one socket whose
    // session belongs to that user.

    const sessions = await db.sessions.find({userID})

    return Array.from(connectedSocketsMap.values())
      .some(socketData => sessions
        .some(session => session._id === socketData.sessionID))
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

  const _loadVarFromObject = (request, response, next, obj, key, required) => {
    if (required && obj[key] === undefined) {
      response.status(400).end(JSON.stringify({
        error: `${key} field missing`
      }))

      return
    }

    if (obj[key] !== undefined) {
      request[middleware.vars][key] = obj[key]
    }

    next()
  }

  const middleware = {
    vars: Symbol('Middleware variables'),

    verifyVarsExists: () => [
      // Makes sure the vars dictionary is actually a thing stored on the request.
      // If it isn't, this creates it.

      function(request, response, next) {
        if (middleware.vars in request === false) {
          request[middleware.vars] = {}
        }

        next()
      }
    ],

    loadVarFromBody: (key, required = true) => [
      // Takes a value from the given body object and stores it as a variable.
      // If the 'required' argument is set to true and the key is not found in
      // the request's body, an error message is shown in response.

      ...middleware.verifyVarsExists(),

      function(request, response, next) {
        _loadVarFromObject(request, response, next, request.body, key, required)
      }
    ],

    loadVarFromQuery: (key, required = true) => [
      // Exactly the same as loadVarFromBody, except grabbing things from the url
      // query (?a=b&c=d...) instead of the request body.

      ...middleware.verifyVarsExists(),

      function(request, response, next) {
        _loadVarFromObject(request, response, next, request.query, key, required)
      }
    ],

    loadVarFromParams: key => [
      // Same as loadVarFromBody, but it loads from the request's params.
      // Use this for GET requests where the parameter is labeled in the URL,
      // e.g .get('/api/message/:messageID').

      ...middleware.verifyVarsExists(),

      function(request, response, next) {
        if (request.params[key] !== undefined) {
          request[middleware.vars][key] = request.params[key]
        }

        next()
      }
    ],

    runIfVarExists: (varName, runIfSo) => (
      runIfSo.map(callback => (request, response, next) => {
        if (varName in request[middleware.vars]) {
          callback(request, response, next)
        } else {
          next()
        }
      })
    ),

    runIfCondition: (conditionFn, runIfSo, runIfNot = []) => (
      runIfSo.map(callback => async (request, response, next) => {
        if (await conditionFn()) {
          callback(request, response, next)
        } else {
          next()
        }
      }).concat(runIfNot.map(callback => async (request, response, next) => {
        if (!await conditionFn()) {
          callback(request, rseponse, next)
        } else {
          next()
        }
      }))
    ),

    getSessionUserFromID: (sessionIDVar, sessionUserVar) => [
      async function(request, response, next) {
        const sessionID = request[middleware.vars][sessionIDVar]
        const user = await getUserBySessionID(sessionID)

        if (!user) {
          response.status(401).end(JSON.stringify({
            error: 'invalid session ID'
          }))

          return
        }

        request[middleware.vars][sessionUserVar] = user

        next()
      }
    ],

    getUserFromUsername: (usernameVar, userVar) => [
      async function(request, response, next) {
        const username = request[middleware.vars][usernameVar]
        const user = await db.users.findOne({username})

        if (!user) {
          response.status(404).end(JSON.stringify({
            error: 'user not found'
          }))

          return
        }

        request[middleware.vars][userVar] = user

        next()
      }
    ],

    getUserFromID: (userIDVar, userVar) => [
      async function(request, response, next) {
        const userID = request[middleware.vars][userIDVar]
        const user = await db.users.findOne({_id: userID})

        if (!user) {
          response.status(404).end(JSON.stringify({
            error: 'user not found'
          }))

          return
        }

        request[middleware.vars][userVar] = user

        next()
      }
    ],

    getMessageFromID: (messageIDVar, messageVar) => [
      async function(request, response, next) {
        const messageID = request[middleware.vars][messageIDVar]
        const message = await db.messages.findOne({_id: messageID})

        if (!message) {
          response.status(404).end(JSON.stringify({
            error: 'message not found'
          }))

          return
        }

        request[middleware.vars][messageVar] = message

        next()
      }
    ],

    getChannelFromID: (channelIDVar, channelVar) => [
      async function(request, response, next) {
        const channelID = request[middleware.vars][channelIDVar]
        const channel = await db.channels.findOne({_id: channelID})

        if (!channel) {
          response.status(404).end(JSON.stringify({
            error: 'channel not found'
          }))

          return
        }

        request[middleware.vars][channelVar] = channel

        next()
      }
    ],

    requireBeAdmin: userVar => [
      async function(request, response, next) {
        const { permissionLevel } = request[middleware.vars][userVar]

        if (permissionLevel !== 'admin') {
          response.status(403).end(JSON.stringify({
            error: 'you are not an admin'
          }))

          return
        }

        next()
      }
    ],

    requireBeMessageAuthor: (messageVar, userVar) => [
      async function(request, response, next) {
        const message = request[middleware.vars][messageVar]
        const user = request[middleware.vars][userVar]

        if (message.authorID !== user._id) {
          response.status(403).end(JSON.stringify({
            error: 'you are not the author of this message'
          }))

          return
        }

        next()
      }
    ],

    requireNameValid: (nameVar, errorFieldName = null) => [
      function(request, response, next) {
        const name = request[middleware.vars][nameVar]

        if (isNameValid(name) === false) {
          response.status(400).end(JSON.stringify({
            // Totally cheating here - this is so that it responds with
            // "username invalid" rather than, e.g., "name invalid", when
            // the username variable is passed. To make this a little less
            // evil, it's possible for that word to be passed manually
            // (as the second argument to requireNameValid).
            error: `${errorFieldName || nameVar} invalid`
          }))

          return
        }

        next()
      }
    ],
  }

  app.use(bodyParser.json())

  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/site/index.html')
  })

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
          error: 'missing sessionID field - not authorized to access API'
        }))
        return
      }

      // We'll save the session ID as a middleware-var so we can use it
      // in the upcoming requests.
      Object.assign(request[middleware.vars], {sessionID})

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
            error: 'not authorized to access API yet - admin action required'
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
      repository: 'https://github.com/towerofnix/decent',
    }))
  })

  const upload = multer({
    limits: {
      files: 1, fileSize: 1e7 // 10 megabytes
    },

    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const path = '/uploads/' + shortid()
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
          error: err.message
        }))
      } else {
        const { path } = req[middleware.vars]
        res.status(200).end(JSON.stringify({
          success: true, path
        }))
      }
    })
  ])

  app.get('/api/server-settings', [
    async (request, response) => {
      const serverSettings = await db.settings.findOne({_id: serverSettingsID})
      response.status(200).end(JSON.stringify(serverSettings))
    }
  ])

  app.post('/api/server-settings', [
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

  app.get('/api/should-use-secure', [
    async (request, response) => {
      const { https } = await db.settings.findOne({_id: serverPropertiesID})

      response.status(200).end(JSON.stringify({
        useSecure: https === 'on' ? true : false
      }))
    }
  ])

  app.get('/api/should-use-authorization', [
    async (request, response) => {
      const useAuthorization = await shouldUseAuthorization()

      let authorizationMessage
      if (useAuthorization) {
        authorizationMessage = (
          await db.settings.findOne({_id: serverSettingsID})
        ).authorizationMessage
      }

      response.status(200).end(JSON.stringify({
        useAuthorization: await shouldUseAuthorization(),
        authorizationMessage
      }))
    }
  ])

  app.post('/api/send-message', [
    ...middleware.loadVarFromBody('text'),
    ...middleware.loadVarFromBody('channelID'),
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

      sendToAllSockets('received chat message', {
        message: await serialize.message(message)
      })

      // Sending a message should also mark the channel as read for that user:
      await markChannelAsRead(sessionUser._id, channelID)

      response.status(201).end(JSON.stringify({
        success: true,
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
          error: 'this message is already pinned'
        }))

        return
      }

      await db.channels.update({_id: channel._id}, {
        $push: {
          pinnedMessageIDs: messageID
        }
      })

      response.status(200).end(JSON.stringify({
        success: true
      }))
    }
  ])

  app.post('/api/add-message-reaction', [
    ...middleware.loadVarFromBody('reactionCode'),
    ...middleware.loadVarFromBody('messageID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.getMessageFromID('messageID', 'message'),

    async (request, response) => {
      const { reactionCode, message, sessionUser: { _id: userID } } = request[middleware.vars]

      if (reactionCode.length !== 1) {
        response.status(400).end(JSON.stringify({
          error: 'reactionCode should be 1-character string'
        }))

        return
      }

      let newReactionCount

      if (reactionCode in message.reactions) {
        if (message.reactions[reactionCode].includes(userID)) {
          response.status(500).end(JSON.stringify({
            error: 'you already reacted with this'
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
        success: true,
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
          error: 'you are not the owner of this message'
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

      sendToAllSockets('edited chat message', {message: await serialize.message(newMessage)})

      response.status(200).end(JSON.stringify({success: true}))
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
            error: 'you are not the owner of this message'
          }))

          return
        }
      }

      await db.messages.remove({_id: message._id})

      // We don't want to send back the message itself, obviously!
      sendToAllSockets('deleted chat message', {messageID: message._id})

      response.status(200).end(JSON.stringify({success: true}))
    }
  ])

  app.get('/api/message/:messageID', [
    ...middleware.loadVarFromParams('messageID'),
    ...middleware.getMessageFromID('messageID', 'message'),

    async (request, response) => {
      const { message } = request[middleware.vars]

      response.status(200).end(JSON.stringify(await serialize.message(message)))
    }
  ])

  app.post('/api/create-channel', [
    ...middleware.loadVarFromBody('name'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.requireNameValid('name'),

    async (request, response) => {
      const { name } = request[middleware.vars]

      if (await db.channels.findOne({name})) {
        response.status(500).end(JSON.stringify({
          error: 'channel name already taken'
        }))

        return
      }

      const channel = await db.channels.insert({
        name,
        pinnedMessageIDs: []
      })

      sendToAllSockets('created new channel', {
        channel: await serialize.channelDetail(channel),
      })

      response.status(201).end(JSON.stringify({
        success: true,
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
          error: 'channel name already taken'
        }))

        return
      }

      await db.channels.update({_id: channelID}, {$set: {name}})

      sendToAllSockets('renamed channel', {
        channelID, newName: name
      })

      response.status(200).end(JSON.stringify({
        success: true
      }))
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
      sendToAllSockets('deleted channel', {
        channelID
      })

      response.status(200).end(JSON.stringify({
        success: true
      }))
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
        success: true,
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
        success: true,
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
    ...middleware.getChannelFromID('channelID', '_'), // Just to make sure the channel exists
    ...middleware.runIfVarExists('before',
      middleware.getMessageFromID('before', 'beforeMessage')
    ),
    ...middleware.runIfVarExists('after',
      middleware.getMessageFromID('after', 'afterMessage')
    ),

    async (request, response) => {
      const { channelID, beforeMessage, afterMessage } = request[middleware.vars]

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

      // We sort the messages by NEWEST date ({date: -1}), so that we're returned
      // the newest messages, but then we reverse the array, so that the actual
      // data returned from the API is sorted by oldest first. (This is so that
      // appending message elements is easier.)

      // TODO: If there is more than 50, show that somehow.
      // TODO: Store 50 as a constant somewhere?
      const cursor = db.messages.cfind(query)
      cursor.sort({date: -1})
      cursor.limit(50)
      const messages = await cursor.exec()
      messages.reverse()

      response.status(200).end(JSON.stringify({
        success: true,
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

      response.status(200).end(JSON.stringify({
        success: true
      }))
    }
  ])

  app.get('/api/channel-is-read', [
    ...middleware.loadVarFromQuery('channelID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    async (request, response) => {
      const { channelID, sessionUser } = request[middleware.vars]

      const count = await getUnreadMessageCountInChannel(sessionUser, channelID)

      response.status(200).end(JSON.stringify({
        success: true, count
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
          error: 'username already taken'
        }))

        return
      }

      if (password.length < 6) {
        response.status(400).end(JSON.stringify({
          error: 'password must be at least 6 characters long'
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
        success: true,
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
          error: 'user not found'
        }))

        return
      }

      response.status(200).end(JSON.stringify({
        success: true,
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
        success: true,
        avatarURL: emailToAvatarURL(email),
      }))
    }
  ])

  app.get('/api/user-list', [
    ...middleware.runIfCondition(() => shouldUseAuthorization, [
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
          success: true,
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
          success: true,
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
          success: true,
          sessionID: session._id
        }))
      } else {
        response.status(401).end(JSON.stringify({
          error: 'incorrect password'
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
          error: 'session not found'
        }))

        return
      }

      response.status(200).end(JSON.stringify({
        success: true,
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
          error: 'authorization is not enabled'
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

      response.status(200).end(JSON.stringify({
        success: true
      }))
    }
  ])

  app.post('/api/deauthorize-user', [
    ...authUserMiddleware,

    async function(request, response) {
      const { userID, sessionUser } = request[middleware.vars]

      if (sessionUser._id === userID) {
        response.status(400).end(JSON.stringify({
          error: 'you cannot deauthorize yourself'
        }))

        return
      }

      await db.users.update({_id: userID}, {
        $set: {authorized: false}
      })

      response.status(200).end(JSON.stringify({
        success: true
      }))
    }
  ])

  app.post('/api/delete-sessions', [
    // No verification ("are you the owner of this session ID" etc), because
    // if you know the session ID, you obviously have power over it!

    async (request, response) => {
      const { sessionIDs } = request[middleware.vars]

      if (Array.isArray(sessionIDs) === false) {
        response.status(400).end(JSON.stringify({
          error: 'expected sessionIDs to be an array'
        }))
      } else if (sessionIDs.find(x => typeof x !== 'string')) {
        respones.status(400).end(JSON.stringify({
          error: 'expected sessionIDs to be an array of strings'
        }))
      } else {
        await Promise.all(sessionIDs.map(
          sid => db.sessions.remove({_id: sid})
        ))

        response.status(200).end(JSON.stringify({
          success: true
        }))
      }
    }
  ])

  app.get('/api/user-session-list', [
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    async (request, response) => {
      const { sessionUser } = request[middleware.vars]

      const sessions = await db.sessions.find({userID: sessionUser._id})

      response.status(200).end(JSON.stringify({
        success: true,
        sessions: await Promise.all(sessions.map(serialize.sessionBrief))
      }))
    }
  ])

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

      if (evt === 'pong data') {
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

          if (await shouldUseAuthorization()) {
            const user = await getUserBySessionID(sessionID)

            if (!user) {
              socketData.sessionID = null
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

    socket.on('close', () => {
      connectedSocketsMap.delete(socket)
    })

    // Immediately send out a ping for data event; this will fill in important
    // data (like the session ID) for the socket as soon as possible. Without this
    // we wait for the next ping, which is an unwanted delay (e.g. it would make
    // detecting the user being online be delayed by up to 10 seconds).
    socket.send(JSON.stringify({evt: 'ping for data'}))
  })

  setInterval(() => {
    // Prune dead socket connections, and ping all
    // other sockets to check they're still alive.
    for (const [ socket, socketData ] of connectedSocketsMap) {
      if (!socketData.isAlive) {
        // R.I.P.
        socket.terminate()
        connectedSocketsMap.delete(socket)
      } else {
        // Ping!
        socketData.isAlive = false
        connectedSocketsMap.set(socket, socketData)

        socket.ping('', false, true)

        // The built-in socket ping method is great for obliterating dead sockets,
        // but we also want to detect data, so we need to send out a normal 'ping'
        // event at the same time, which the client can detect and respond to.
        socket.send(JSON.stringify({evt: 'ping for data'}))
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
