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
const { internalRoles, guestPermissionKeys } = require('./roles')
const packageObj = require('./package.json')

const mkdir = util.promisify(fs.mkdir)

const {
  serverSettingsID, serverPropertiesID, setSetting, getAllSettings
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

  await Promise.all(internalRoles.map(async role => {
    if (await db.roles.findOne({_id: role._id}) === null) {
      await db.roles.insert(role)
    }
  }))

  const {
    asUnixDate, unixDateNow,
    getUserIDBySessionID,
    getUserBySessionID,
    emailToAvatarURL,
    isUserOnline,
    getUnreadMessageCountInChannel,
    getMentionsFromMessageContent,
    getPrioritizedRoles,
    addRole,
  } = util

  const sendToAllSockets = function(evt, data) {
    for (const [ socket, socketData ] of connectedSocketsMap.entries()) {
      socket.send(JSON.stringify({ evt, data }))
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
        [`lastReadChannelDates.${channelID}`]: unixDateNow()
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

  app.get('/api/', async (request, response) => {
    const { https } = await getAllSettings(db.settings, serverPropertiesID)

    response.status(200).json({
      implementation: '@decent/server',
      decentVersion: packageObj.version,
      useSecureProtocol: https === 'on'
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
    ...middleware.requirePermission('sessionUser', 'manageEmotes'),
    ...middleware.loadVarFromBody('shortcode'),
    ...middleware.requireNameValid('shortcode'),
    ...middleware.loadVarFromBody('imageURL'),
    ...middleware.validateVar('imageURL', validate.string),

    async function(request, response, next) {
      const { imageURL, shortcode } = request[middleware.vars]

      if (await db.emotes.findOne({shortcode})) {
        response.status(400).json({error: errors.NAME_ALREADY_TAKEN})
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
        response.status(404).json({error: errors.NOT_FOUND_emote})
      }
    }
  ])

  app.delete('/api/emotes/:shortcode', [
    ...middleware.loadVarFromParams('shortcode'),
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requirePermission('sessionUser', 'manageEmotes'),

    async function(request, response, next) {
      const { shortcode } = request[middleware.vars]
      const numRemoved = await db.emotes.remove({shortcode})
      if (numRemoved) {
        response.status(200).json({})
      } else {
        response.status(404).json({error: errors.NOT_FOUND_emote})
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

  app.patch('/api/settings', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requirePermission('sessionUser', 'manageServer'),

    ...middleware.loadVarFromQueryOrBody('name', false),
    ...middleware.loadVarFromQueryOrBody('iconURL', false),

    ...middleware.runIfVarExists('name',
      middleware.validateVar('name', validate.nonEmptyString)
    ),

    ...middleware.runIfVarExists('iconURL',
      middleware.validateVar('iconURL', validate.string)
    ),

    async (request, response) => {
      const { name, iconURL } = request[middleware.vars]

      if (typeof name === 'string') {
        await setSetting(db.settings, serverSettingsID, 'name', name)
      }

      if (typeof iconURL === 'string') {
        await setSetting(db.settings, serverSettingsID, 'iconURL', iconURL)
      }

      sendToAllSockets('server-settings/update', {
        settings: await getAllSettings(db.settings, serverSettingsID)
      })

      response.status(200).json({})
    }
  ])

  app.post('/api/messages', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.loadVarFromBody('channelID'),
    ...middleware.validateVar('channelID', validate.string),
    ...middleware.getChannelFromID('channelID', 'channel'),
    ...middleware.requireChannelPermission('sessionUser', 'channel', 'sendMessages'),
    ...middleware.loadVarFromBody('text'),
    ...middleware.validateVar('text', validate.string),

    async (request, response) => {
      const { text, channelID, sessionUser } = request[middleware.vars]

      const message = await db.messages.insert({
        authorID: sessionUser._id,
        authorUsername: sessionUser.username,
        authorEmail: sessionUser.email,
        authorFlair: sessionUser.flair,
        type: 'user',
        text: request.body.text,
        dateCreated: unixDateNow() - 1,
        dateEdited: null,
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

  /*
  // TODO: Permissions.
  // TODO: Actually design the reactions endpoint.
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
  */

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
          dateEdited: unixDateNow()
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
        if (await util.userHasPermission(sessionUser._id, 'deleteMessages', message.channelID) === false) {
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
    ...middleware.requirePermission('sessionUser', 'manageChannels'),
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
    ...middleware.requirePermission('sessionUser', 'manageChannels'),
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
    ...middleware.requirePermission('sessionUser', 'manageChannels'),
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
        query.dateCreated = {}

        if (beforeMessage) {
          query.dateCreated.$lt = beforeMessage.dateCreated
        }

        if (afterMessage) {
          query.dateCreated.$gt = afterMessage.dateCreated
        }
      }

      const sort = {dateCreated: -1}

      if (afterMessage) {
        sort.dateCreated = +1
      }

      // We sort the messages by NEWEST creation date ({dateCreated: -1}), so
      // that we're returned the newest messages, but then we reverse the array,
      // therefore the data returned from the API is sorted by oldest first.
      // (This is so that appending message elements is easier.)

      // TODO: If there is more than 50, show that somehow.
      // TODO: Store 50 as a constant somewhere?
      const cursor = db.messages.cfind(query)
      cursor.sort(sort)
      cursor.limit(limit ? Math.max(1, Math.min(50, parseInt(limit))) : 50)
      const messages = await cursor.exec()
      if (sort.dateCreated === -1) {
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
    ...middleware.requirePermission('sessionUser', 'managePins'),
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
          error: errors.ALREADY_PERFORMED_pin_message
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
    ...middleware.requirePermission('sessionUser', 'managePins'),
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
    async (request, response) => {
      const users = await db.users.find({})

      response.status(200).json({
        users: await Promise.all(users.map(serialize.user))
      })
    }
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
        roleIDs: [],
        lastReadChannelDates: {},
        mentionedInMessageIDs: [],
      })

      // Note that we run serialize.user twice here -- once, to send to the
      // general public of connected sockets, and again, to be sent back as the
      // HTTP response to POST /api/users. The first one doesn't contain some
      // private data that the second one does (like the (unset) email).

      sendToAllSockets('user/new', {
        user: await serialize.user(user)
      })

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
          error: errors.NOT_FOUND_user
        })

        return
      }

      response.status(200).json({
        user: await serialize.user(user, sessionUser)
      })
    }
  ])

  app.get('/api/users/:userID/permissions', [
    ...middleware.loadVarFromParams('userID'),
    ...middleware.getUserFromID('userID', '_'), // To make sure the user exists.

    async (request, response) => {
      const { userID } = request[middleware.vars]

      response.status(200).json({
        permissions: await util.getUserPermissions(userID)
      })
    }
  ])

  app.get('/api/users/:userID/channel-permissions/:channelID', [
    ...middleware.loadVarFromParams('userID'),
    ...middleware.loadVarFromParams('channelID'),

    // To make sure the user and channel exist:
    ...middleware.getUserFromID('userID', '_'),
    ...middleware.getChannelFromID('channelID', '_'),

    async (request, response) => {
      const { userID, channelID } = request[middleware.vars]

      response.status(200).json({
        permissions: await util.getUserPermissions(userID, channelID)
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
    ...middleware.loadVarFromQueryOrBody('roleIDs', false),

    // Typecheck/permission-check
    async (request, response, next) => {
      const {
        user, sessionUser,
        requestFromAdmin, password, email, flair, roleIDs,
      } = request[middleware.vars]

      if (typeof password !== 'undefined') {
        // { old: String, new: String }

        if (typeof password.old !== 'string') {
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'password.old should be a string'
          })})
        }

        if (typeof password.new !== 'string') {
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'password.new should be a string'
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
            message: 'email should be null or a string'
          })})
        }

        if (typeof email === 'string') {
          request[middleware.vars].email = email.toLowerCase()

          if (email.length > 254) {
            return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
              message: 'email too long (>254 characters)'
            })})
          }
        }
      }

      if (typeof flair !== 'undefined' && flair !== null) {
        // String, max length 50.

        if (typeof flair !== 'string') {
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'flair should be null or a string'
          })})
        }

        if (flair.length > 50) {
          return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
            message: 'flair too long (>50 characters)'
          })})
        }
      }

      if (!validate.arrayOfRoleIDs(roleIDs, {db})) {
        return response.status(400).json({error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
          message: `roleIDs should be ${validate.arrayOfRoleIDs.description}`
        })})
      }

      next()
    },

    // Perform mutation
    async (request, response) => {
      const {
        userID, user: oldUser,
        password, email, flair, roleIDs,
      } = request[middleware.vars]

      if (password) {
        const passwordHash = await bcrypt.hash(password.new)

        await db.users.update({_id: userID}, {
          $set: { password: passwordHash },
        })
      }

      const $set = {}
      if (typeof roleIDs !== 'undefined') $set.roleIDs = roleIDs
      if (typeof email !== 'undefined') $set.email = email
      if (typeof flair !== 'undefined') $set.flair = flair

      await db.users.update({_id: userID}, {$set})

      const serializedUser = await serialize.user(await db.users.findOne({_id: userID}))

      sendToAllSockets('user/update', {user: serializedUser})

      response.status(200).json({})
    },
  ])

  app.post('/api/users/:userID/roles', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requirePermission('sessionUser', 'manageRoles'),
    ...middleware.loadVarFromParams('userID'),
    ...middleware.loadVarFromBody('roleID'),
    ...middleware.getUserFromID('userID', 'targetUser'),
    ...middleware.getRoleFromID('roleID', '_'), // Make sure it exists.

    async function(request, response) {
      const { sessionUser, targetUser, userID, roleID } = request[middleware.vars]

      // Don't add the role if the session user doesn't have all the permissions
      // that the role specifies!
      if (!(await util.userHasPermissionsOfRole(sessionUser._id, roleID))) {
        response.status(403).json({
          error: errors.NOT_ALLOWED_missing_perms_of_role
        })

        return
      }

      // Don't add the role if the user already has it!
      if (targetUser.roleIDs.includes(roleID)) {
        response.status(500).json({
          error: errors.ALREADY_PERFORMED_give_role
        })

        return
      }

      // Actually add the role.
      db.users.update({_id: userID}, {
        $push: {roleIDs: roleID}
      })

      sendToAllSockets('user/update', {
        user: await serialize.user(await db.users.findOne({_id: userID}))
      })

      response.status(200).json({})
    }
  ])

  app.delete('/api/users/:userID/roles/:roleID', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requirePermission('sessionUser', 'manageRoles'),
    ...middleware.loadVarFromParams('userID'),
    ...middleware.loadVarFromParams('roleID'),
    ...middleware.getUserFromID('userID', 'targetUser'),
    ...middleware.getRoleFromID('roleID', '_'), // Make sure it exists.

    async function(request, response) {
      const { sessionUser, role, targetUser, userID, roleID } = request[middleware.vars]

      // Same permission check as for giving roles -- this is so, for example,
      // a lower-level role manager can't remove anyone's top-of-the-top
      // admin role!
      if (!(await util.userHasPermissionsOfRole(sessionUser._id, roleID))) {
        response.status(403).json({
          error: errors.NOT_ALLOWED_missing_perms_of_role
        })

        return
      }

      // Don't remove the role if the user doesn't have it!
      if (!targetUser.roleIDs.includes(roleID)) {
        response.status(500).json({
          error: errors.ALREADY_PERFORMED_take_role
        })

        return
      }

      // Actually take the role:
      await db.users.update({_id: userID}, {
        $pull: {roleIDs: roleID}
      })

      sendToAllSockets('user/update', {
        user: await serialize.user(await db.users.findOne({_id: userID}))
      })

      response.status(200).json({})
    }
  ])

  app.get('/api/users/:id/roles', [
    ...middleware.loadVarFromParams('id'),
    ...middleware.getUserFromID('id', 'user'),
    async (request, response) => {
      const { user: { roleIDs } } = request[middleware.vars]
      response.status(200).json({roleIDs})
    }
  ])

  app.get('/api/roles', [
    async (request, response) => {
      const prioritizedRoles = await getPrioritizedRoles()

      response.status(200).json({
        roles: await Promise.all(prioritizedRoles.map(serialize.role))
      })
    }
  ])

  // Note that this goes before app.get('/api/roles/:id').
  // That's because otherwise, it'll think that fetching /api/roles/order means
  // you just want to fetch *that* route, with id equal to order.
  // We don't need to worry about a role somehow being generated with the ID
  // "order" because nedb always generates 16-character strings for its IDs.
  app.get('/api/roles/order', [
    async (request, response) => {
      const { rolePrioritizationOrder } = await getAllSettings(db.settings, serverPropertiesID)

      response.status(200).json({
        roleIDs: rolePrioritizationOrder
      })
    }
  ])

  app.patch('/api/roles/order', [
    ...middleware.loadSessionID('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    // TODO: Check permissions - manageRoles.
    ...middleware.loadVarFromBody('roleIDs'),
    ...middleware.validateVar('roleIDs', validate.arrayOfAllRoleIDs),

    async (request, response) => {
      const { roleIDs } = request[middleware.vars]
      await setSetting(db.settings, serverPropertiesID, 'rolePrioritizationOrder', roleIDs)
      response.status(200).json({})
    }
  ])

  app.get('/api/roles/:id', [
    async (request, response) => {
      const role = await db.roles.findOne({_id: request.params.id})

      if (role) {
        response.status(200).json({role: await serialize.role(role)})
      } else {
        response.status(404).json({error: errors.NOT_FOUND_role})
      }
    }
  ])

  app.post('/api/roles', [
    // TODO: Permissions for this. Well, and everything else. But also this.
    ...middleware.loadVarFromBody('name'),
    ...middleware.loadVarFromBody('permissions'),
    ...middleware.validateVar('name', validate.roleName),
    ...middleware.validateVar('permissions', validate.permissionsObject),
    // TODO: Error 403 if the requester doesn't have one or more of the
    // permissions they want to give this role. This should be a portable
    // middleware (taking the session-user and permissions objects).

    async (request, response) => {
      const { name, permissions } = request[middleware.vars]
      const role = await addRole(name, permissions)

      sendToAllSockets('role/new', {role: await serialize.role(role)})
      response.status(201).json({roleID: role._id})
    }
  ])

  app.patch('/api/roles/:id', [
    // TODO: Permissions for this.
    ...middleware.loadVarFromParams('id'),
    ...middleware.loadVarFromBody('name', false),
    ...middleware.loadVarFromBody('permissions', false),
    ...middleware.runIfVarExists('name',
      middleware.validateVar('name', validate.roleName)
    ),
    ...middleware.runIfVarExists('permissions',
      middleware.validateVar('permissions', validate.permissionsObject)
    ),
    // TODO: Also error 403 here, just like when creating a role.

    async (request, response) => {
      const { id, name, permissions } = request[middleware.vars]

      if (id === '_everyone') {
        if (Object.keys(permissions).some(k => !guestPermissionKeys.includes(k))) {
          response.status(403).json({error: errors.NOT_GUEST_PERMISSION})
          return
        }
      }

      const $set = {}
      if (typeof name !== 'undefined') $set.name = name
      if (typeof permissions !== 'undefined') $set.permissions = permissions

      const role = await db.roles.update({_id: id}, {$set}, {multi: false})

      sendToAllSockets('role/update', {
        role: await serialize.role(role)
      })

      response.status(200).json({})
    }
  ])

  app.delete('/api/roles/:id', [
    // TODO: Also also permissions for this also.
    ...middleware.loadVarFromParams('id'),

    async (request, response) => {
      const { id } = request[middleware.vars]

      if (internalRoles.isInternalID(id)) {
        response.status(403).json({error: errors.NOT_DELETABLE_ROLE})
        return
      }

      const numRemoved = await db.roles.remove({_id: id})
      if (numRemoved) {
        // Also remove the role ID from the role prioritization order.
        const { rolePrioritizationOrder } = await getAllSettings(db.settings, serverPropertiesID)
        if (rolePrioritizationOrder.includes(id)) {
          rolePrioritizationOrder.splice(rolePrioritizationOrder.indexOf(id), 1)
        }
        await setSetting(
          db.settings, serverPropertiesID,
          'rolePrioritizationOrder', rolePrioritizationOrder
        )

        response.status(200).json({})
      } else {
        response.status(404).json({error: errors.NOT_FOUND_role})
      }
    }
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
          dateCreated: unixDateNow()
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
        response.status(404).json({error: errors.NOT_FOUND_session})
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
          error: errors.NOT_FOUND_session
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
        return unixDateNow() - this.dateCreated > maximumLifetime
      }
    }, {multi: true})
  }

  setInterval(pruneOldSessions, 5 * 60 * 1000) // Every 5min.
  pruneOldSessions()

  return {util, serialize, sendToAllSockets}
}

Object.assign(module.exports, { DB_IN_MEMORY })
