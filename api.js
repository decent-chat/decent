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

module.exports = function attachAPI(app, {io, db}) {
  const getUserBySessionID = async function(sessionID) {
    const session = await db.sessions.findOne({_id: sessionID})

    if (!session) {
      return null
    }

    const user = await db.users.findOne({_id: session.user})

    if (!user) {
      return null
    }

    return user
  }

  const getUserIDBySessionID = async function(sessionID) {
    // Gets the user ID of a session (by the session's ID).
    // This uses one less database request than getUserBySessionID, since it
    // does not actually request the stored user data.

    const session = await db.sessions.findOne({_id: sessionID})

    if (!session) {
      return null
    }

    return session.user
  }

  const getDateAsISOString = function() {
    return (new Date()).toISOString()
  }

  const middleware = {
    input: Symbol('Middleware input'),
    output: Symbol('Middleware output'),

    loadInputFromBody: function(request, response, next) {
      request[middleware.input] = {}
      request[middleware.output] = {}

      for (const [ key, value ] of Object.entries(request.body)) {
        request[middleware.input][key] = value
      }

      next()
    },

    getSessionUserFromID: async function(request, response, next) {
      const { sessionID } = request[middleware.input]

      if (!sessionID) {
        response.status(400).end(JSON.stringify({
          error: 'missing sessionID field'
        }))

        return
      }

      const user = await getUserBySessionID(sessionID)

      if (!user) {
        response.status(401).end(JSON.stringify({
          error: 'invalid session ID'
        }))

        return
      }

      request[middleware.output].sessionUser = user

      next()
    },

    getMessageFromID: async function (request, response, next) {
      const { messageID } = request[middleware.input]

      if (!messageID) {
        response.status(400).end(JSON.stringify({
          error: 'missing messageID field'
        }))

        return
      }

      const message = await db.messages.findOne({_id: messageID})

      if (!message) {
        response.status(404).end(JSON.stringify({
          error: 'message not found'
        }))

        return
      }

      request[middleware.output].message = message

      next()
    }
  }

  app.use(express.static('site'))
  app.use(bodyParser.json())

  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/site/index.html')
  })

  app.use('/api/*', async (request, response, next) => {
    response.header('Content-Type', 'application/json')

    next()
  })

  app.post('/api/send-message', middleware.loadInputFromBody)
  app.post('/api/send-message', middleware.getSessionUserFromID)
  app.post('/api/send-message', async (request, response) => {
    const { text, signature } = request[middleware.input]
    const { sessionUser } = request[middleware.output]

    if (!text) {
      response.status(400).end(JSON.stringify({
        error: 'missing text field'
      }))

      return
    }

    const message = await db.messages.insert({
      authorID: sessionUser._id,
      authorUsername: sessionUser.username,
      date: getDateAsISOString(),
      revisions: [
        {
          text: request.body.text,
          signature: request.body.signature,
          date: getDateAsISOString()
        }
      ],
      reactions: {}
    })

    io.emit('received chat message', {message})

    response.status(201).end(JSON.stringify({
      success: true,
      messageID: message._id
    }))
  })

  app.post('/api/add-message-reaction', middleware.loadInputFromBody)
  app.post('/api/add-message-reaction', middleware.getSessionUserFromID)
  app.post('/api/add-message-reaction', middleware.getMessageFromID)
  app.post('/api/add-message-reaction', async (request, response) => {
    const { reactionCode } = request[middleware.input]
    const { message, sessionUser: { _id: userID } } = request[middleware.output]

    if (!reactionCode) {
      response.status(400).end(JSON.stringify({
        error: 'missing reactionCode field'
      }))

      return
    }

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
  })

  app.post('/api/edit-message', async (request, response) => {
    const { messageID, text, signature, sessionID } = request.body

    if (!sessionID || !messageID || !text) {
      response.status(400).end(JSON.stringify({
        error: 'missing sessionID, messageID, or text field'
      }))

      return
    }

    const userID = await getUserIDBySessionID(sessionID)

    if (!userID) {
      response.status(401).end(JSON.stringify({
        error: 'invalid session ID'
      }))

      return
    }

    const oldMessage = await db.messages.findOne({_id: messageID})

    if (!oldMessage) {
      response.status(500).end(JSON.stringify({
        error: 'no message by given id'
      }))

      return
    }

    if (userID !== oldMessage.authorID) {
      response.status(403).end(JSON.stringify({
        error: 'you are not the owner of this message'
      }))

      return
    }

    const [ numAffected, newMessage ] = await db.messages.update({_id: messageID}, {
      $push: {
        revisions: {
          text, signature,
          date: getDateAsISOString()
        }
      }
    }, {
      multi: false,
      returnUpdatedDocs: true
    })

    io.emit('edited chat message', {message: newMessage})

    response.status(200).end(JSON.stringify({success: true}))
  })

  app.get('/api/message/:message', async (request, response) => {
    const message = await db.messages.findOne({_id: request.params.message})

    if (message) {
      response.status(200).end(JSON.stringify(message))
    } else {
      response.status(404).end(JSON.stringify({
        error: 'message not found'
      }))
    }
  })

  app.post('/api/release-public-key', async (request, response) => {
    const { key, sessionID } = request.body

    if (!key || !sessionID) {
      response.status(400).end(JSON.stringify({
        error: 'missing key or sessionID field'
      }))

      return
    }

    const user = await getUserBySessionID(sessionID)

    if (!user) {
      response.status(401).end(JSON.stringify({
        error: 'invalid session ID'
      }))

      return
    }

    const { username } = user

    io.emit('released public key', {key, username})

    response.status(200).end(JSON.stringify({
      success: true
    }))
  })

  app.post('/api/create-channel', async (request, response) => {
    const { name, sessionID } = request.body

    if (!name || !sessionID) {
      response.status(400).end(JSON.stringify({
        error: 'missing name or sessionID field'
      }))

      return
    }

    const user = await getUserBySessionID(sessionID)

    if (!user) {
      response.status(401).end(JSON.stringify({
        error: 'invalid session id'
      }))

      return
    }

    const { permissionLevel } = user

    if (permissionLevel !== 'admin') {
      response.status(403).end(JSON.stringify({
        error: 'you are not an admin'
      }))

      return
    }

    if (await db.channels.findOne({name})) {
      response.status(500).end(JSON.stringify({
        error: 'channel name already taken'
      }))

      return
    }

    const channel = await db.channels.insert({
      name
    })

    response.status(201).end(JSON.stringify({
      success: true,
      channel
    }))
  })

  app.get('/api/channel-list', async (request, response) => {
    const channels = await db.channels.find({}, {name: 1})

    response.status(200).end(JSON.stringify({
      success: true,
      channels
    }))
  })

  app.post('/api/register', async (request, response) => {
    const { username } = request.body
    const reValidUsername = /^[a-zA-Z0-9_-]+$/g
    let { password } = request.body

    if (!username || !password) {
      response.status(400).end(JSON.stringify({
        error: 'missing username or password field'
      }))

      return
    }

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
    password = ''

    const user = await db.users.insert({
      username,
      passwordHash,
      permissionLevel: 'member',
      salt
    })

    response.status(201).end(JSON.stringify({
      success: true,
      username: username,
      id: user._id,
    }))
  })

  app.get('/api/user/:userID', async (request, response) => {
    const { userID } = request.params

    const user = await db.users.findOne({_id: userID})

    if (!user) {
      response.status(404).end(JSON.stringify({
        error: 'user not found'
      }))

      return
    }

    // TODO: Duplicated code...
    delete user.passwordHash
    delete user.salt

    response.status(200).end(JSON.stringify({
      success: true,
      user
    }))
  })

  app.post('/api/login', async (request, response) => {
    const { username } = request.body
    let { password } = request.body

    const user = await db.users.findOne({username})

    if (!user) {
      response.status(404).end(JSON.stringify({
        error: 'user not found'
      }))

      return
    }

    const { salt, passwordHash } = user

    if (await bcrypt.compare(password, passwordHash)) {
      const session = await db.sessions.insert({
        _id: uuidv4(),
        user: user._id
      })

      response.status(200).end(JSON.stringify({
        sessionID: session._id
      }))
    } else {
      response.status(401).end(JSON.stringify({
        error: 'incorrect password'
      }))
    }
  })

  app.get('/api/session/:sessionID', async (request, response) => {
    const user = await getUserBySessionID(request.params.sessionID)

    if (!user) {
      response.status(404).end(JSON.stringify({
        error: 'session not found'
      }))

      return
    }

    // Don't give the following away, even to the user themselves.
    // They should never have a use for them regardless of security.
    delete user.passwordHash
    delete user.salt

    response.status(200).end(JSON.stringify({
      success: true,
      user
    }))
  })
}
