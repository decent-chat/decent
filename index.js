'use strict'

const Datastore = require('nedb-promise')
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)

async function main() {
  const db = {
    messages: new Datastore({filename: 'db/messages'})
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  app.use(express.static('site'))
  app.use(bodyParser.json())

  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/site/index.html')
  })

  app.post('/api/send-message', async (request, response) => {
    const { text, signature, userID } = request.body

    if (!text || !userID) {
      return
    }

    const message = await db.messages.insert({
      text: request.body.text,
      signature: request.body.signature,
      author: request.body.userID,
      date: Date.now()
    })

    io.emit('received chat message', {message})

    response.end('sent')
  })


  app.post('/api/release-public-key', async (request, response) => {
    const { key, userID } = request.body

    if (!key || !userID) {
      return
    }

    io.emit('released public key', {key, userID})
  })

  io.on('connection', socket => {
    console.log('a user connected')

    socket.on('disconnect', () => {
      console.log('a user disconnected')
    })
  })

  http.listen(3000, () => {
    console.log('listening on port 3000')
  })
}

main()
  .catch(err => console.error(err))
