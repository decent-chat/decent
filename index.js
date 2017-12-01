'use strict'

process.on('unhandledRejection', err => {
  console.error(err.stack)
})

const Datastore = require('nedb-promise')
const express = require('express')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt-nodejs')
const socketio = require('socket.io')
const http = require('http')
const uuidv4 = require('uuid/v4')
const readline = require('readline')

const bcryptGenSalt = (rounds = 10) => new Promise((resolve, reject) => {
  bcrypt.genSalt(rounds, (err, salt) => {
    if (err) {
      reject(err)
    } else {
      resolve(salt)
    }
  })
})

const bcryptHash = (str, salt) => new Promise((resolve, reject) => {
  bcrypt.hash(str, salt, null, (err, hash) => {
    if (err) {
      reject(err)
    } else {
      resolve(hash)
    }
  })
})

const bcryptCompare = (data, encrypted) => new Promise((resolve, reject) => {
  bcrypt.compare(data, encrypted, (err, result) => {
    if (err) {
      reject(err)
    } else {
      resolve(result)
    }
  })
})

const app = express()
const httpServer = http.Server(app)
const io = socketio(httpServer)

async function main() {
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

  const db = {
    messages: new Datastore({filename: 'db/messages'}),
    users: new Datastore({filename: 'db/users'}),
    sessions: new Datastore({filename: 'db/sessions'}),
    channels: new Datastore({filename: 'db/channels'}),
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  app.use(express.static('site'))
  app.use(bodyParser.json())

  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/site/index.html')
  })

  app.post('/api/send-message', async (request, response) => {
    const { text, signature, sessionID } = request.body

    if (!text || !sessionID) {
      response.end(JSON.stringify({
        error: 'missing text or sessionID field'
      }))

      return
    }

    const user = await getUserBySessionID(sessionID)

    if (!user) {
      response.end(JSON.stringify({
        error: 'invalid session ID'
      }))
      return
    }

    const message = await db.messages.insert({
      authorID: user._id,
      authorUsername: user.username,
      date: Date.now(),
      revisions: [
        {
          text: request.body.text,
          signature: request.body.signature,
          date: Date.now()
        }
      ]
    })

    io.emit('received chat message', {message})

    response.end(JSON.stringify({
      success: true
    }))
  })

  app.post('/api/edit-message', async (request, response) => {
    const { messageID, text, signature, sessionID } = request.body

    if (!sessionID || !messageID || !text) {
      response.end(JSON.stringify({
        error: 'missing sessionID, messageID, or text field'
      }))

      return
    }

    const oldMessage = await db.messages.findOne({_id: messageID})

    if (!oldMessage) {
      response.end(JSON.stringify({
        error: 'no message by given id'
      }))

      return
    }

    const userID = await getUserIDBySessionID(sessionID)

    if (!userID) {
      response.end(JSON.stringify({
        error: 'invalid session ID'
      }))
    }

    if (userID !== oldMessage.authorID) {
      response.end(JSON.stringify({
        error: 'you are not the owner of this message'
      }))

      return
    }

    const [ numAffected, newMessage ] = await db.messages.update({_id: messageID}, {
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

    io.emit('edited chat message', {message: newMessage})

    response.end(JSON.stringify({success: true}))
  })

  app.get('/api/message/:message', async (request, response) => {
    const message = await db.messages.findOne({_id: request.params.message})

    if (message) {
      response.end(JSON.stringify(message))
    } else {
      response.end(JSON.stringify({
        error: 'message not found'
      }))
    }
  })

  app.post('/api/release-public-key', async (request, response) => {
    const { key, sessionID } = request.body

    if (!key || !sessionID) {
      return
    }

    const user = await getUserBySessionID(sessionID)

    if (!user) {
      response.end(JSON.stringify({
        error: 'invalid session ID'
      }))

      return
    }

    const { username } = user

    io.emit('released public key', {key, username})

    response.end(JSON.stringify({
      success: true
    }))
  })

  app.post('/api/create-channel', async (request, response) => {
    const { name, sessionID } = request.body

    if (!name || !sessionID) {
      response.end(JSON.stringify({
        error: 'missing name or sessionID field'
      }))

      return
    }

    const user = await getUserBySessionID(sessionID)

    if (!user) {
      response.end(JSON.stringify({
        error: 'invalid session id'
      }))

      return
    }

    const { permissionLevel } = user

    if (permissionLevel !== 'admin') {
      response.end(JSON.stringify({
        error: 'you are not an admin'
      }))

      return
    }

    const channel = await db.channels.insert({
      name
    })

    response.end(JSON.stringify({
      success: true,
      channel
    }))
  })

  app.post('/api/register', async (request, response) => {
    const { username } = request.body
    let { password } = request.body

    if (!username || !password) {
      response.end(JSON.stringify({
        error: 'missing username or password field'
      }))
      return
    }

    if (await db.users.findOne({username})) {
      response.end(JSON.stringify({
        error: 'username already taken'
      }))
      return
    }

    if (password.length < 6) {
      response.end(JSON.stringify({
        error: 'password must be at least 6 characters long'
      }))
      return
    }

    const salt = await bcryptGenSalt()
    const passwordHash = await bcryptHash(password, salt)
    password = ''

    const user = await db.users.insert({
      username,
      passwordHash,
      permissionLevel: 'member',
      salt
    })

    response.end(JSON.stringify({
      success: true,
      username: username,
      id: user._id,
    }))
  })

  app.post('/api/login', async (request, response) => {
    const { username } = request.body
    let { password } = request.body

    const user = await db.users.findOne({username})

    if (!user) {
      response.end(JSON.stringify({
        error: 'user not found'
      }))
      return
    }

    const { salt, passwordHash } = user

    if (await bcryptCompare(password, passwordHash)) {
      const session = await db.sessions.insert({
        _id: uuidv4(),
        user: user._id
      })

      response.end(JSON.stringify({
        sessionID: session._id
      }))
    } else {
      response.end(JSON.stringify({
        error: 'incorrect password'
      }))
    }
  })

  app.get('/api/session/:sessionID', async (request, response) => {
    const user = await getUserBySessionID(request.params.sessionID)

    if (!user) {
      response.end(JSON.stringify({
        error: 'session not found'
      }))

      return
    }

    response.end(JSON.stringify({
      success: true,
      user
    }))
  })

  await new Promise(resolve => httpServer.listen(3000, resolve))

  console.log('listening on port 3000')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.setPrompt('> ')
  rl.prompt()

  rl.on('line', async input => {
    rl.pause()

    const parts = input.split(' ').filter(p => p.length > 0)

    if (parts.length) handleCommand: {
      if (parts[0] === 'help' || parts[0] === '?') {
        console.log('This is the administrator command line interface for')
        console.log('the bantisocial chat system. This is NOT a text-based')
        console.log('interface for chatting; use an actual client for that.')
        console.log('Commands:')
        console.log(' - make-admin: makes an already-registered user an admin.')
      }

      if (parts[0] === 'make-admin') {
        if (parts.length !== 2) {
          console.error('Expected (make-admin <username>)')
          break handleCommand
        }

        const username = parts[1]

        const user = await db.users.findOne({username})

        if (!user) {
          console.error('Error: There is no user with username ' + username)
          break handleCommand
        }

        await db.users.update({username}, {
          $set: {
            permissionLevel: 'admin'
          }
        })

        console.log(`Made ${username} an admin.`)
      }
    }

    rl.resume()
    rl.prompt()
  })
}

main()
  .catch(err => console.error(err.stack))
