'use strict'

const Datastore = require('nedb-promise')
const express = require('express')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt-nodejs')
const socketio = require('socket.io')
const http = require('http')
const uuidv4 = require('uuid/v4')

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

  const db = {
    messages: new Datastore({filename: 'db/messages'}),
    users: new Datastore({filename: 'db/users'}),
    sessions: new Datastore({filename: 'db/sessions'})
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
      return
    }

    const { username } = await getUserBySessionID(sessionID)

    const message = await db.messages.insert({
      author: username,
      date: Date.now(),
      revisions: [
        {
          text: request.body.text,
          signature: request.body.signature,
          date: Date.now()
        }
      ],
      author: username,
      date: Date.now()
    })

    io.emit('received chat message', {message})

    response.end(JSON.stringify({
      success: true
    }))
  })

  app.post('/api/release-public-key', async (request, response) => {
    const { key, sessionID } = request.body

    if (!key || !sessionID) {
      return
    }

    const { username } = await getUserBySessionID(sessionID)

    io.emit('released public key', {key, username})

    response.end(JSON.stringify({
      success: true
    }))
  })

  app.post('/api/register', async (request, response) => {
    const { username } = request.body
    let { password } = request.body

    if (!username || !password) {
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

  io.on('connection', socket => {
    console.log('a user connected')

    socket.on('disconnect', () => {
      console.log('a user disconnected')
    })
  })

  httpServer.listen(3000, () => {
    console.log('listening on port 3000')
  })
}

main()
  .catch(err => console.error(err.stack))
