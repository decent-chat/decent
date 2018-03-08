const express = require('express')
const bodyParser = require('body-parser')
const multer = require('multer')
const shortid = require('shortid')
const uuidv4 = require('uuid/v4')
const fs = require('fs')
const path = require('path')
const util = require('util')
const bcrypt = require('./bcrypt-util')
const { makeMiddleware, validate } = require('./middleware')
const makeSerializers = require('./serialize')
const makeCommonUtil = require('./common')
const packageObj = require('./package.json')

const mkdir = util.promisify(fs.mkdir)

const {
  serverSettingsID, serverPropertiesID, setSetting,
} = require('./settings')
const errors = require('./errors')

const DB_IN_MEMORY = Symbol()

module.exports = async function attachAPI(app, {wss, db, dbDir}) {
  // Used to keep track of connected clients and related data, such as
  // session IDs.
  const connectedSocketsMap = new Map()

  const util = makeCommonUtil({db, connectedSocketsMap})
  const middleware = makeMiddleware({db, util})
  const serialize = makeSerializers({db, util})

  const {
    getUserIDBySessionID,
    getUserBySessionID,
    emailToAvatarURL,
    isUserOnline,
    shouldUseAuthorization, isUserAuthorized,
    getUnreadMessageCountInChannel,
    getMentionsFromMessageContent,
  } = util

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

  const handleMentionsInMessage = async function (message) {
    for (const userID of new Set(await getMentionsFromMessageContent(message.text))) {
      // Add message ID to user.mentions if its not already there
      await db.users.update({_id: userID}, {
        $addToSet: {
          mentionedInMessageIDs: message._id,
        },
      })

      // Notify the user of their mention
      for (const [ socket, socketData ] of connectedSocketsMap.entries()) {
        if (socketData.userID === userID) {
          socket.send(JSON.stringify({
            evt: 'user/mentions/add',
            data: {
              message: await serialize.message(message),
            },
          }))
        }
      }
    }
  }

  const handleUnmentionsInMessage = async function (message, newText) {
    const mentionedOld = await getMentionsFromMessageContent(message.text)
    const mentionedNew = await getMentionsFromMessageContent(newText)
    const unmentionedInNew = mentionedOld.filter(id => !mentionedNew.includes(id))

    for (const userID of unmentionedInNew) {
      // Remove msg ID from user mentions
      await db.users.update({_id: userID}, {
        $pull: {
          mentionedInMessageIDs: message._id,
        },
      })

      // Notify the user of their unmention
      for (const [ socket, socketData ] of connectedSocketsMap.entries()) {
        if (socketData.userID === userID) {
          socket.send(JSON.stringify({
            evt: 'user/mentions/remove',
            data: {
              messageID: message.id,
            },
          }))
        }
      }
    }
  }

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

  const markChannelAsRead = async function(userObj, channelID, emitEvent = true) {
    await db.users.update({_id: userObj._id}, {
      $set: {
        [`lastReadChannelDates.${channelID}`]: Date.now()
      }
    })

    if (emitEvent) {
      const updatedChannel = await db.channels.findOne({_id: channelID})

      for (const [ socket, socketData ] of connectedSocketsMap.entries()) {
        if (socketData.userID === userObj._id) {
          socket.send(JSON.stringify({
            evt: 'channel/update',
            data: {
              channel: await serialize.channel(updatedChannel, userObj),
            },
          }))
        }
      }
    }
  }

  app.use(bodyParser.json())

  if (process.env.NODE_ENV !== 'production') {
    app.set('json spaces', 2)
  }

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
          ['GET', /^\/$/],
          ['POST', /^\/sessions$/],
          ['GET', /^\/sessions\//],
          ['POST', /^\/users$/],
          ['GET', /^\/username-available/],
          ['GET', /^\/properties$/],
          ['GET', /^\/settings$/],
        ].find(([ m, re ]) => request.method === m && re.test(request.path))
      )) {
        request[middleware.vars].shouldVerify = true
      }

      next()
    },

    ...middleware.loadSessionID('sessionID', false),

    (request, response, next) => {
      if (!request[middleware.vars].sessionID && request[middleware.vars].shouldVerify) {
        // No session ID given - just quit here.
        response.status(403).json({
          error: errors.AUTHORIZATION_ERROR
        })
        return
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
          response.status(403).json({
            error: errors.AUTHORIZATION_ERROR
          })
        }
      }
    ]),

    // Don't pollute middleware-vars!
    function(request, response, next) {
      delete request[middleware.vars].shouldVerify
      delete request[middleware.vars].sessionID
      next()
    }
  ])

  app.get('/api/', (request, response) => {
    response.status(200).json({
      decentVersion: packageObj.version
    })
  })

  if (dbDir === DB_IN_MEMORY) {
    // If the database is in-memory we have nowhere to store uploads, so we'll
    // just reject them instead.
    app.post('/api/upload-image', (request, response) => {
      response.status(500).json({
        error: errors.UPLOADS_DISABLED
      })
    })
  } else {
    const upload = multer({
      limits: {
        files: 1, fileSize: 1e7 // 10 megabytes
      },

      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.resolve(dbDir, 'uploads/' + shortid())

          req[middleware.vars].path = uploadPath

          mkdir(uploadPath)
            .then(() => cb(null, uploadPath))
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
      ...middleware.loadSessionID('sessionID'),
      ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
      //...middleware.requireBeAdmin('sessionUser'),
      (req, res) => uploadSingleImage(req, res, err => {
        if (err) {
          res.status(500).json({
            error: Object.assign({}, errors.UPLOAD_FAILED, {message: err.message})
          })
        } else {
          res.status(200).json({
            path: '/' + path.relative(dbDir, req[middleware.vars].path)
          })
        }
      })
    ])
  }

  app.post('/api/emotes', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.loadVarFromBody('shortcode'),
    ...middleware.requireNameValid('shortcode'),
    ...middleware.loadVarFromBody('imageURL'),
    ...middleware.validateVar('imageURL', validate.string),

    async function(request, response, next) {
      const { imageURL, shortcode } = request[middleware.vars]

      if (await db.emotes.findOne({shortcode})) {
        response.status(400).json(errors.NAME_ALREADY_TAKEN)
        return
      }

      const newEmote = {imageURL, shortcode}
      await db.emotes.insert(newEmote)
      sendToAllSockets('emote/new', {
        emote: await serialize.emote(newEmote)
      })
      response.status(201).json({})
    }
  ])

  app.get('/api/emotes/:shortcode', [
    ...middleware.loadVarFromParams('shortcode'),

    async function(request, response, next) {
      const { shortcode } = request[middleware.vars]
      const emote = await db.emotes.findOne({shortcode})
      if (emote) {
        response.redirect(302, emote.imageURL)
      } else {
        response.status(404).json({error: errors.NOT_FOUND})
      }
    }
  ])

  app.delete('/api/emotes/:shortcode', [
    ...middleware.loadVarFromParams('shortcode'),
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),

    async function(request, response, next) {
      const { shortcode } = request[middleware.vars]
      const numRemoved = await db.emotes.remove({shortcode})
      if (numRemoved) {
        response.status(200).json({})
      } else {
        response.status(404).json({error: errors.NOT_FOUND})
      }
    }
  ])

  app.get('/api/emotes', [
    async function(request, response, next) {
      const emotes = await db.emotes.find({})
      const serialized = await Promise.all(emotes.map(serialize.emote))
      serialized.sort((a, b) => {
        const as = a.shortcode
        const bs = b.shortcode
        return as < bs ? -1 : bs < as ? 1 : 0
      })
      response.status(200).json({
        emotes: serialized
      })
    }
  ])

  app.get('/api/settings', [
    async (request, response) => {
      const serverSettings = await db.settings.findOne({_id: serverSettingsID})

      delete serverSettings._id

      response.status(200).json({
        settings: serverSettings
      })
    }
  ])

  app.post('/api/settings', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),

    async (request, response) => {
      const serverSettings = await db.settings.findOne({_id: serverSettingsID})

      const results = {}

      for (const [ key, value ] of Object.entries(request.body)) {
        results[key] = await setSetting(db.settings, serverSettingsID, key, value)
      }

      response.status(200).json({results})
    }
  ])

  app.get('/api/properties', [
    async (request, response) => {
      const { https } = await db.settings.findOne({_id: serverPropertiesID})
      const useAuthorization = await shouldUseAuthorization()

      response.status(200).json({
        properties: {
          useSecure: https === 'on',
          useAuthorization
        }
      })
    }
  ])

  app.post('/api/messages', [
    ...middleware.loadVarFromBody('text'),
    ...middleware.validateVar('text', validate.string),
    ...middleware.loadVarFromBody('channelID'),
    ...middleware.validateVar('channelID', validate.string),
    ...middleware.getChannelFromID('channelID', '_'), // To verify that it exists.
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    async (request, response) => {
      const { text, channelID, sessionUser } = request[middleware.vars]

      const message = await db.messages.insert({
        authorID: sessionUser._id,
        authorUsername: sessionUser.username,
        authorEmail: sessionUser.email,
        authorFlair: sessionUser.flair,
        type: 'user',
        text: request.body.text,
        date: Date.now() - 1,
        editDate: null,
        channelID: channelID,
        reactions: {}
      })

      sendToAllSockets('message/new', {
        message: await serialize.message(message)
      })

      await handleMentionsInMessage(message)

      // Sending a message should also mark the channel as read for that user:
      await markChannelAsRead(sessionUser, channelID, false)

      response.status(201).json({
        messageID: message._id
      })
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
          response.status(500).json({
            error: errors.ALREADY_PERFORMED
          })

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

      response.status(200).json({
        newCount: newReactionCount
      })
    }
  ])

  app.patch('/api/messages/:messageID', [
    ...middleware.loadVarFromParams('messageID'),
    ...middleware.loadSessionID('sessionID'),
    ...middleware.loadVarFromBody('text'),
    ...middleware.validateVar('text', validate.string),
    ...middleware.getMessageFromID('messageID', 'oldMessage'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeMessageAuthor('oldMessage', 'sessionUser'),

    async (request, response) => {
      const { text, oldMessage, sessionUser: { _id: userID } } = request[middleware.vars]

      if (userID !== oldMessage.authorID) {
        response.status(403).json({
          error: errors.NOT_YOURS
        })

        return
      }

      await handleUnmentionsInMessage(oldMessage, text)

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

      await handleMentionsInMessage(newMessage)

      response.status(200).json({})
    }
  ])

  app.delete('/api/messages/:messageID', [
    ...middleware.loadVarFromParams('messageID'),
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.getMessageFromID('messageID', 'message'),

    async (request, response) => {
      const { message, sessionUser } = request[middleware.vars]

      if (sessionUser._id !== message.authorID) {
        if (sessionUser.permissionLevel !== 'admin') {
          response.status(403).json({
            error: errors.NOT_YOURS
          })

          return
        }
      }

      // Normally we'd check if this actually deleted anything, to return a
      // NOT_FOUND error if it didn't, but we already know that the message
      // exists (from getMessageFromID earlier, to check if the session user
      // was its author).
      await db.messages.remove({_id: message._id})

      await handleUnmentionsInMessage(message, '')

      // We don't want to send back the message itself, obviously!
      sendToAllSockets('message/delete', {messageID: message._id})

      // If this message is pinned to any channel, unpin it, because it just
      // got deleted!
      const channelWithPin = await db.channels.findOne({
        pinnedMessageIDs: {$elemMatch: message._id},
      })

      if (channelWithPin) {
        channelWithPin.pinnedMessageIDs = channelWithPin.pinnedMessageIDs
          .filter(msg => msg !== message._id)

        await db.channels.update({_id: channelWithPin._id}, {
          $set: {
            pinnedMessageIDs: channelWithPin.pinnedMessageIDs,
          }
        })

        sendToAllSockets('channel/pins/remove', {messageID: message._id})
      }

      response.status(200).json({})
    }
  ])

  app.get('/api/messages/:messageID', [
    ...middleware.loadVarFromParams('messageID'),
    ...middleware.getMessageFromID('messageID', 'message'),

    async (request, response) => {
      const { message } = request[middleware.vars]

      response.status(200).json({
        message: await serialize.message(message)
      })
    }
  ])

  app.get('/api/channels', [
    ...middleware.loadSessionID('sessionID', false),
    ...middleware.runIfVarExists('sessionID',
      middleware.getSessionUserFromID('sessionID', 'sessionUser')
    ),

    async (request, response) => {
      const { sessionUser } = request[middleware.vars]

      const channels = await db.channels.find({})

      response.status(200).json({
        channels: await Promise.all(channels.map(channel => {
          return serialize.channel(channel, sessionUser)
        }))
      })
    }
  ])

  app.post('/api/channels', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.loadVarFromBody('name'),
    ...middleware.requireNameValid('name'),

    async (request, response) => {
      const { name } = request[middleware.vars]

      if (await db.channels.findOne({name})) {
        response.status(500).json({
          error: errors.NAME_ALREADY_TAKEN
        })

        return
      }

      const channel = await db.channels.insert({
        name,
        pinnedMessageIDs: []
      })

      sendToAllSockets('channel/new', {
        channel: await serialize.channel(channel),
      })

      response.status(201).json({
        channelID: channel._id
      })
    }
  ])

  app.get('/api/channels/:channelID', [
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.getChannelFromID('channelID', 'channel'),
    ...middleware.loadSessionID('sessionID', false),
    ...middleware.runIfVarExists('sessionID',
      middleware.getSessionUserFromID('sessionID', 'sessionUser')
    ),

    async (request, response) => {
      const { channel, sessionUser, sessionID } = request[middleware.vars]

      response.status(200).json({
        channel: await serialize.channel(channel, sessionUser)
      })
    }
  ])

  app.patch('/api/channels/:channelID', [
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.loadVarFromBody('name'),
    ...middleware.requireNameValid('name'),
    ...middleware.getChannelFromID('channelID', '_'), // To verify the channel exists.

    async (request, response) => {
      const { channelID, name, sessionUser } = request[middleware.vars]

      if (await db.channels.findOne({name})) {
        response.status(400).json({
          error: errors.NAME_ALREADY_TAKEN
        })

        return
      }

      await db.channels.update({_id: channelID}, {$set: {name}})

      sendToAllSockets('channel/update', {
        channel: await serialize.channel(await db.channels.findOne({_id: channelID}), sessionUser),
      })

      response.status(200).json({})
    }
  ])

  app.delete('/api/channels/:channelID', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.loadVarFromParams('channelID'),
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

      response.status(200).json({})
    }
  ])

  app.post('/api/channels/:channelID/mark-read', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.getChannelFromID('channelID', '_'), // To verify that it exists

    async (request, response) => {
      const { sessionUser, channelID } = request[middleware.vars]

      await markChannelAsRead(sessionUser, channelID)

      response.status(200).json({})
    }
  ])

  app.get('/api/channels/:channelID/messages', [
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

      if (afterMessage) {
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

      response.status(200).json({
        messages: await Promise.all(messages.map(serialize.message))
      })
    }
  ])

  app.get('/api/channels/:channelID/pins', [
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.getChannelFromID('channelID', 'channel'),

    async (request, response) => {
      const { channel } = request[middleware.vars]

      response.status(200).json({
        pins: (await Promise.all(
          channel.pinnedMessageIDs.map(id =>
            db.messages.findOne({_id: id})
              .then(msg => msg ? serialize.message(msg) : null)
          )
        )).filter(Boolean)
      })
    }
  ])

  app.post('/api/channels/:channelID/pins', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.getChannelFromID('channelID', 'channel'),
    ...middleware.loadVarFromBody('messageID'),
    ...middleware.getMessageFromID('messageID', 'message'),
    (request, response, next) => {
      const { message, channelID } = request[middleware.vars]
      if (message.channelID === channelID) {
        next()
      } else {
        response.status(400).json({error: errors.NOT_FROM_SAME_CHANNEL})
      }
    },

    async (request, response) => {
      const { messageID, message, channel } = request[middleware.vars]

      if (channel.pinnedMessageIDs.includes(messageID)) {
        response.status(500).json({
          error: errors.ALREADY_PERFORMED
        })

        return
      }

      await db.channels.update({_id: channel._id}, {
        $push: {
          pinnedMessageIDs: messageID
        }
      })

      sendToAllSockets('channel/pins/add', {message: await serialize.message(message)})
      response.status(200).json({})
    }
  ])

  app.delete('/api/channels/:channelID/pins/:messageID', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.getChannelFromID('channelID', 'channel'),
    ...middleware.loadVarFromParams('messageID'),
    ...middleware.getMessageFromID('messageID', 'message'),
    (request, response, next) => {
      const { message, channelID } = request[middleware.vars]
      if (message.channelID === channelID) {
        next()
      } else {
        response.status(400).json({error: errors.NOT_FROM_SAME_CHANNEL})
      }
    },

    async (request, response) => {
      const { messageID, message, channel } = request[middleware.vars]

      if (!channel.pinnedMessageIDs.includes(messageID)) {
        response.status(404).json({
          error: errors.NOT_FOUND
        })

        return
      }

      channel.pinnedMessageIDs = channel.pinnedMessageIDs.filter(msg => msg !== messageID)

      await db.channels.update({_id: channel._id}, {
        $set: {
          pinnedMessageIDs: channel.pinnedMessageIDs,
        }
      })

      sendToAllSockets('channel/pins/remove', {messageID})
      response.status(200).json({})
    }
  ])

  app.get('/api/users', [
    ...middleware.runIfCondition(() => shouldUseAuthorization(), [
      ...middleware.loadSessionID('sessionID', false),
      ...middleware.runIfVarExists('sessionID',
        middleware.getSessionUserFromID('sessionID'),
      ),

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

        response.status(200).json(result)
      }
    ], [
      // If authorization is disabled we can take a far simpler route - just
      // return every user.
      async (request, response) => {
        const users = await db.users.find({})

        response.status(200).json({
          users: await Promise.all(users.map(serialize.user))
        })
      }
    ])
  ])

  app.post('/api/users', [
    ...middleware.loadVarFromBody('username'),
    ...middleware.requireNameValid('username'),
    ...middleware.loadVarFromBody('password'),
    ...middleware.validateVar('password', validate.string),

    async (request, response) => {
      const { username, password } = request[middleware.vars]

      if (await db.users.findOne({username})) {
        response.status(500).json({
          error: errors.NAME_ALREADY_TAKEN
        })

        return
      }

      if (password.length < 6) {
        response.status(400).json({
          error: errors.SHORT_PASSWORD
        })

        return
      }

      const passwordHash = await bcrypt.hash(password)

      const user = await db.users.insert({
        username,
        passwordHash,
        email: null,
        flair: null,
        permissionLevel: 'member',
        authorized: false,
        lastReadChannelDates: {},
        mentionedInMessageIDs: [],
      })

      // Note that we run serialize.user twice here -- once, to send to the
      // general public of connected (authorized-user) sockets, and again,
      // which is sent back as the HTTP response to POST /api/users. The first
      // one doesn't contain some private data that the second one does (like
      // the (unset) email).

      // Only tell client sockets that a user has been created if the server
      // isn't using authorization. After all, if the user isn't authorized
      // (which it isn't, upon being created), other users won't be able to
      // interact with it until it is.
      if (await shouldUseAuthorization() === false) {
        sendToAllSockets('user/new', {
          user: await serialize.user(user)
        })
      }

      response.status(201).json({
        user: await serialize.user(user, user)
      })
    }
  ])

  app.get('/api/users/:userID', [
    ...middleware.loadVarFromParams('userID'),
    ...middleware.loadSessionID('sessionID', false),
    ...middleware.runIfVarExists('sessionID',
      middleware.getSessionUserFromID('sessionID', 'sessionUser')
    ),

    async (request, response) => {
      const { userID, sessionUser } = request[middleware.vars]

      const user = await db.users.findOne({_id: userID})

      if (!user) {
        response.status(404).json({
          error: errors.NOT_FOUND
        })

        return
      }

      response.status(200).json({
        user: await serialize.user(user, sessionUser)
      })
    }
  ])

  app.get('/api/username-available/:username', [
    ...middleware.loadVarFromParams('username'),
    ...middleware.requireNameValid('username'),

    async (request, response) => {
      const { username } = request[middleware.vars]

      const user = await db.users.findOne({username})

      if (user) {
        response.status(200).json({
          available: false
        })
      } else {
        response.status(200).json({
          available: true
        })
      }
    }
  ])

  app.patch('/api/users/:userID', [
    ...middleware.loadVarFromParams('userID'),
    ...middleware.loadSessionID('sessionID'),

    ...middleware.getUserFromID('userID', 'user'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    // Session-check
    async (request, response, next) => {
      const { user, sessionUser } = request[middleware.vars]

      if (sessionUser.permissionLevel === 'admin') {
        request[middleware.vars].requestFromAdmin = true
        next()
      } else if (user.id === sessionUser.id) {
        request[middleware.vars].requestFromAdmin = false
        next()
      } else {
        response.status(403).json({
          error: Object.assign({}, errors.NOT_YOURS, {message: 'You cannot modify someone else\'s data.'})
        })
      }
    },

    ...middleware.loadVarFromQueryOrBody('password', false),
    ...middleware.loadVarFromQueryOrBody('email', false),
    ...middleware.loadVarFromQueryOrBody('flair', false),
    ...middleware.loadVarFromQueryOrBody('permissionLevel', false),
    ...middleware.loadVarFromQueryOrBody('authorized', false),

    // Typecheck/permission-check
    async (request, response, next) => {
      const {
        user, sessionUser,
        requestFromAdmin, password, email, flair, permissionLevel, authorized,
      } = request[middleware.vars]

      if (!requestFromAdmin && (typeof permissionLevel !== 'undefined' || typeof authorized !== 'undefined')) {
        // permissionLevel and authorized require an admin session to be provided!

        return response.status(403).json({error: Object.assign({}, errors.MUST_BE_ADMIN, {
          message: 'permissionLevel/authorized cannot be changed without an admin session',
        })})
      }

      if (typeof password !== 'undefined') {
        // { old: String, new: String }

        if (typeof password.old !== 'string') {
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'password.old should be a String.',
          })})
        }

        if (typeof password.new !== 'string') {
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'password.new should be a String.',
          })})
        }

        // Check that 'old' is actually the old password of this user.
        const validOldPass = await bcrypt.compare(password.old, user.passwordHash)

        if (!validOldPass) {
          return response.status(400).json({error: errors.INCORRECT_PASSWORD})
        }

        // Check that 'new' is long enough.
        if (password.new.length < 6) {
          return response.status(400).json({
            error: errors.SHORT_PASSWORD
          })
        }
      }

      if (typeof email !== 'undefined') {
        if (typeof email !== 'string' && email !== null) {
          // String - an email address, hopefully. We don't verify it though.
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'email should be null, or a String.',
          })})
        }

        if (typeof email === 'string') {
          request[middleware.vars].email = email.toLowerCase()

          if (email.length > 254) {
            return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
              message: 'email too long (>254 characters)',
            })})
          }
        }
      }

      if (typeof flair !== 'undefined' && flair !== null) {
        // String, max length 50.

        if (typeof flair !== 'string') {
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'flair should be null, or a String.',
          })})
        }

        if (flair.length > 50) {
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'flair should not be longer than 50 characters.',
          })})
        }
      }

      if (typeof permissionLevel !== 'undefined' && permissionLevel !== 'admin' && permissionLevel !== 'member') {
        // "admin" | "member"
        return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
          message: 'permissionLevel should be "admin" or "member".',
        })})
      }

      if (typeof authorized !== 'undefined') {
        if (!await shouldUseAuthorization()) {
          return response.status(400).json({error: errors.AUTHORIZATION_ERROR})
        }

        if (typeof authorized !== 'boolean') {
          // Boolean.
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'authorized should be a Boolean.',
          })})
        }
      }

      next()
    },

    // Perform mutation
    async (request, response) => {
      const {
        userID, user: oldUser,
        password, email, flair, permissionLevel, authorized,
      } = request[middleware.vars]

      if (password) {
        const passwordHash = await bcrypt.hash(password.new)

        await db.users.update({_id: userID}, {
          $set: { password: passwordHash },
        })
      }

      const $set = {}
      if (typeof authorized !== 'undefined') $set.authorized = authorized
      if (typeof email !== 'undefined') $set.email = email
      if (typeof flair !== 'undefined') $set.flair = flair
      if (typeof permissionLevel !== 'undefined') $set.permissionLevel = permissionLevel

      await db.users.update({_id: userID}, {$set})

      const serializedUser = await serialize.user(await db.users.findOne({_id: userID}))

      // If whether the user is authorized or not has changed, emit the
      // respective events.
      if (oldUser.authorized === false && authorized === true) {
        sendToAllSockets('user/new', {user: serializedUser})
      } else if (oldUser.authorized === true && authorized === false) {
        sendToAllSockets('user/gone', {userID})
      }

      // If a user was deauthorized, don't send an update event.
      if (serializedUser.authorized) {
        sendToAllSockets('user/update', {user: serializedUser})
      }

      response.status(200).json({})
    },
  ])

  app.get('/api/sessions', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    async (request, response) => {
      const { sessionUser } = request[middleware.vars]

      const sessions = await db.sessions.find({userID: sessionUser._id})

      response.status(200).json({
        sessions: await Promise.all(sessions.map(serialize.session))
      })
    }
  ])

  app.post('/api/sessions', [
    ...middleware.loadVarFromBody('username'),
    ...middleware.validateVar('username', validate.string),
    ...middleware.loadVarFromBody('password'),
    ...middleware.validateVar('password', validate.string),
    ...middleware.getUserFromUsername('username', 'user'),

    async (request, response) => {
      const { username, password, user } = request[middleware.vars]
      const { passwordHash } = user

      if (await bcrypt.compare(password, passwordHash)) {
        const session = await db.sessions.insert({
          _id: uuidv4(),
          userID: user._id,
          dateCreated: Date.now()
        })

        response.status(200).json({
          sessionID: session._id
        })
      } else {
        response.status(401).json({
          error: errors.INCORRECT_PASSWORD
        })
      }
    }
  ])

  app.delete('/api/sessions/:sessionID', [
    ...middleware.loadVarFromParams('sessionID'),

    // No verification ("are you the owner of this session ID" etc), because
    // if you know the session ID, you obviously have power over it!

    async (request, response) => {
      const { sessionID } = request[middleware.vars]
      const numRemoved = await db.sessions.remove({_id: sessionID})
      if (numRemoved) {
        response.status(200).json({})
      } else {
        response.status(404).json({error: errors.NOT_FOUND})
      }
    }
  ])

  app.get('/api/sessions/:sessionID', [
    ...middleware.loadVarFromParams('sessionID'),

    async (request, response) => {
      const { sessionID } = request[middleware.vars]

      const session = await db.sessions.findOne({_id: sessionID})

      if (!session) {
        response.status(404).json({
          error: errors.NOT_FOUND
        })

        return
      }

      const user = await db.users.findOne({_id: session.userID})

      response.status(200).json({
        session: await serialize.session(session),
        user: await serialize.user(user, user)
      })
    }
  ])

  app.use(['/api/*', '/api'], async (error, request, response, next) => {
    // console.error('\x1b[31m' + error.message + '\x1b[2m\n' + error.stack + '\x1b[0m')

    response.status(500).json({
      error: Object.assign(errors.INTERNAL_ERROR, {
        message: error.message,
        stack: error.stack
      })
    })
  })

  app.use('/api/*', (request, response, next) => {
    response.status(404).json({error: errors.NOT_FOUND})
  })

  wss.on('connection', socket => {
    const socketData = {
      sessionID: null,
      userID: null,
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

  return {util, serialize, sendToAllSockets}
}

Object.assign(module.exports, { DB_IN_MEMORY })
