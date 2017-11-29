'use strict'

const Datastore = require('nedb-promise')
const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)

async function main() {
  const db = {
    messages: new Datastore({filename: 'db/messages'})
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  app.use(express.static('site'))

  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/site/index.html')
  })

  io.on('connection', socket => {
    console.log('a user connected')

    socket.on('disconnect', () => {
      console.log('a user disconnected')
    })

    socket.on('send chat message', async msg => {
      if (typeof msg !== 'object') {
        return
      }

      if ('text' in msg === false) {
        return
      }

      if ('userID' in msg === false) {
        return
      }

      const message = await db.messages.insert({
        text: msg.text,
        signature: msg.signature,
        author: msg.userID,
        date: Date.now()
      })

      io.emit('received chat message', {message})
    })

    socket.on('release public key', msg => {
      if (typeof msg !== 'object') {
        return
      }

      if ('key' in msg === false) {
        return
      }

      if ('userID' in msg === false) {
        return
      }

      io.emit('released public key', {
        key: msg.key,
        userID: msg.userID
      })
    })
  })

  http.listen(3000, () => {
    console.log('listening on port 3000')
  })
}

main()
  .catch(err => console.error(err))
