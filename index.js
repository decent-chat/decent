'use strict'

process.on('unhandledRejection', err => {
  console.error(err.stack)
})

const Datastore = require('nedb-promise')
const express = require('express')
const socketio = require('socket.io')
const http = require('http')
const readline = require('readline')

const attachAPI = require('./api')

const app = express()
const httpServer = http.Server(app)
const io = socketio(httpServer)

async function main() {
  const db = {
    messages: new Datastore({filename: 'db/messages'}),
    users: new Datastore({filename: 'db/users'}),
    sessions: new Datastore({filename: 'db/sessions'}),
    channels: new Datastore({filename: 'db/channels'}),
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  app.use(express.static('site'))
  attachAPI(app, {io, db})

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
