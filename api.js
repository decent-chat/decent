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
const uuidv4 = require('uuid/v4')
const bcrypt = require('./bcrypt-util')

const {
  serverSettingsID, serverPropertiesID,
  setSetting, getSetting,
} = require('./settings')

module.exports = async function attachAPI(app, {wss, db}) {
  // Used to keep track of connected clients and related
  // data, such as the channelID it is currently viewing.
  const connectedSocketsMap = new Map()

  const sendToAllSockets = function(evt, data) {
    for (const socket of connectedSocketsMap.keys()) {
      socket.send(JSON.stringify({ evt, data }))
    }
  }

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
      date: m.date,
      channelID: m.channelID,
      revisions: await Promise.all(m.revisions.map(serialize.messageRevision)),
      reactions: m.reactions
    }),

    messageRevision: async r => ({
      text: r.text,
      signature: r.signature,
      date: r.date
    }),

    user: async u => ({
      id: u._id,
      username: u.username,
      permissionLevel: u.permissionLevel,
    }),

    channelShort: async c => ({
      id: c._id,
      name: c.name
    }),

    // Extra details for a channel - these aren't returned in the channel list API,
    // but are when a specific channel is fetched.
    channelDetail: async c => {
      let pinnedMessages = await Promise.all(c.pinnedMessageIDs.map(id => db.messages.findOne({_id: id})))

      // Null messages are filtered out, just in case there's a broken message ID in the
      // pinned message list (e.g. because a message was deleted).
      pinnedMessages = pinnedMessages.filter(Boolean)

      pinnedMessages = await Promise.all(pinnedMessages.map(serialize.message))

      Object.assign(await serialize.channelShort(c), {
        pinnedMessages
      })
    }
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
        if (required && request.body[key] === undefined) {
          response.status(400).end(JSON.stringify({
            error: `${key} field missing`
          }))

          return
        }

        if (request.body[key] !== undefined) {
          request[middleware.vars][key] = request.body[key]
        }

        next()
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
    ]
  }

  app.use(bodyParser.json())

  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/site/index.html')
  })

  app.use('/api/*', async (request, response, next) => {
    response.header('Content-Type', 'application/json')
    response.header('Access-Control-Allow-Origin', '*')
    response.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')

    next()
  })

  app.get('/api/server-settings', [
    async (request, response) => {
      const serverSettings = await db.settings.findOne({_id: serverSettingsID})
      response.status(200).end(JSON.stringify(serverSettings))
    }
  ])

  app.post('/api/server-settings', [
    ...middleware.loadVarFromBody('sessionID'),
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

  app.post('/api/send-message', [
    ...middleware.loadVarFromBody('text'),
    ...middleware.loadVarFromBody('channelID'),
    ...middleware.loadVarFromBody('signature', false),
    ...middleware.loadVarFromBody('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),

    async (request, response) => {
      const { text, signature, channelID, sessionUser } = request[middleware.vars]

      const message = await db.messages.insert({
        authorID: sessionUser._id,
        authorUsername: sessionUser.username,
        date: Date.now(),
        channelID: channelID,
        revisions: [
          {
            text: request.body.text,
            signature: request.body.signature,
            date: Date.now()
          }
        ],
        reactions: {}
      })

      sendToAllSockets('received chat message', {
        message: await serialize.message(message)
      })

      response.status(201).end(JSON.stringify({
        success: true,
        messageID: message._id
      }))
    }
  ])

  app.post('/api/pin-message', [
    ...middleware.loadVarFromBody('messageID'),
    ...middleware.loadVarFromBody('sessionID'),
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
    ...middleware.loadVarFromBody('sessionID'),
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
    ...middleware.loadVarFromBody('sessionID'),
    ...middleware.loadVarFromBody('messageID'),
    ...middleware.loadVarFromBody('text'),
    ...middleware.loadVarFromBody('signature', false),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.getMessageFromID('messageID', 'oldMessage'),
    ...middleware.requireBeMessageAuthor('oldMessage', 'sessionUser'),

    async (request, response) => {
      const { text, signature, oldMessage, sessionUser: { _id: userID } } = request[middleware.vars]

      if (userID !== oldMessage.authorID) {
        response.status(403).end(JSON.stringify({
          error: 'you are not the owner of this message'
        }))

        return
      }

      const [ numAffected, newMessage ] = await db.messages.update({_id: oldMessage._id}, {
        $push: {
          revisions: {
            text, signature,
            date: Date.now()
          }
        }
      }, {
        multi: false,
        returnUpdatedDocs: true
      })

      sendToAllSockets('edited chat message', {message: await serialize.message(newMessage)})

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
    ...middleware.loadVarFromBody('sessionID'),
    ...middleware.getSessionUserFromID('sessionID', 'sessionUser'),
    ...middleware.requireBeAdmin('sessionUser'),

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
        channel
      }))
    }
  ])

  app.get('/api/channel/:channelID', [
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.getChannelFromID('channelID', 'channel'),

    async (request, response) => {
      const { channel } = request[middleware.vars]

      response.status(200).end(JSON.stringify({
        success: true,
        channel: await serialize.channelDetail(channel)
      }))
    }
  ])

  app.get('/api/channel-list', async (request, response) => {
    const channels = await db.channels.find({}, {name: 1})

    response.status(200).end(JSON.stringify({
      success: true,
      channels: await Promise.all(channels.map(serialize.channelShort))
    }))
  })

  app.get('/api/channel/:channelID/latest-messages(/before/:beforeMessageID)?', [
    ...middleware.loadVarFromParams('channelID'),
    ...middleware.loadVarFromParams('beforeMessageID'),
    ...middleware.getChannelFromID('channelID', '_'), // Just to make sure the channel exists
    ...middleware.runIfVarExists('beforeMessageID',
      middleware.getMessageFromID('beforeMessageID', 'beforeMessage')
    ),

    async (request, response) => {
      const { channelID, beforeMessage } = request[middleware.vars]

      const query = {channelID}
      if (beforeMessage) {
        query.date = {$lt: beforeMessage.date}
      }

      // TODO: If there is more than 50, show that somehow.
      // TODO: Store 50 as a constant somewhere?
      const cursor = db.messages.cfind(query)
      cursor.sort({date: -1})
      cursor.limit(50)
      const messages = await cursor.exec()
      messages.reverse()

      // We sort the messages by NEWEST date ({date: -1}), so that we're returned
      // the newest messages, but then we reverse the array, so that the actual
      // data returned from the API is sorted by oldest first. (This is so that
      // appending message elements is easier.)

      response.status(200).end(JSON.stringify({
        success: true,
        messages: await Promise.all(messages.map(serialize.message))
      }))
    }
  ])

  app.post('/api/register', [
    ...middleware.loadVarFromBody('username'),
    ...middleware.loadVarFromBody('password'),

    async (request, response) => {
      const { username, password } = request[middleware.vars]
      const reValidUsername = /^[a-zA-Z0-9_-]+$/g

      if (!reValidUsername.test(username)) {
        response.status(400).end(JSON.stringify({
          error: 'username invalid'
        }))

        return
      }

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
        passwordHash,
        permissionLevel: 'member',
        salt
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
          userID: user._id
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
      const user = await getUserBySessionID(sessionID)

      if (!user) {
        response.status(404).end(JSON.stringify({
          error: 'session not found'
        }))

        return
      }

      response.status(200).end(JSON.stringify({
        success: true,
        user: await serialize.user(user)
      }))
    }
  ])

  wss.on('connection', socket => {
    connectedSocketsMap.set(socket, {
      channelID: null,
      isAlive: true,
    })

    socket.on('message', message => {
      let messageObj
      try {
        messageObj = JSON.parse(message)
      } catch(err) {
        return
      }

      const { evt, data } = messageObj

      if (evt === 'view channel') {
        if (!data) {
          return
        }

        connectedSocketsMap.set(socket, {
          channelID: data // channelID
        })
      }
    })

    socket.on('pong', () => {
      const socketData = connectedSocketsMap.get(socket)

      if (!socketData.isAlive) {
        // Pong!
        socketData.isAlive = true
        connectedSocketsMap.set(socket, socketData)
      }
    })

    socket.on('close', () => {
      connectedSocketsMap.delete(socket)
    })
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
      }
    }
  }, 10 * 1000) // Every 10s.
}
