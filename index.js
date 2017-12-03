'use strict'

process.on('unhandledRejection', err => {
  console.error(err.stack)
})

const Datastore = require('nedb-promise')
const express = require('express')
const socketio = require('socket.io')
const http = require('http')
const readline = require('readline')
const fixWS = require('fix-whitespace')

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

  const port = parseInt(process.argv[2]) || 3000
  await new Promise(resolve => httpServer.listen(port, resolve))

  console.log(`bantisocial - listening on port ${port} (try "license" or "help" for info)`)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.setPrompt('> ')
  rl.prompt()

  rl.on('line', async input => {
    rl.pause()

    const parts = input.split(' ').filter(p => p.length > 0)

    if (parts.length) {
      switch (parts[0]) {
        case 'help':
        case '?': {
          console.log(fixWS`
            This is the administrator command line interface for
            the bantisocial chat system. This is NOT a text-based
            interface for chatting; use an actual client for that.
            Commands:
            - license: shows license information (hint: it's GPL 3.0!)
            - make-admin: makes an already-registered user an admin.
          `)

          break
        }

        case 'make-admin': {
          if (parts.length !== 2) {
            console.error('Expected (make-admin <username>)')
            break
          }

          const username = parts[1]

          const user = await db.users.findOne({username})

          if (!user) {
            console.error('Error: There is no user with username ' + username)
            break
          }

          await db.users.update({username}, {
            $set: {
              permissionLevel: 'admin'
            }
          })

          console.log(`Made ${username} an admin.`)

          break
        }

        case 'license': {
          console.log(fixWS`
            bantisocial - actually free rip-off of Discord

            This program is free software: you can redistribute it and/or modify
            it under the terms of the GNU General Public License as published by
            the Free Software Foundation, either version 3 of the License, or
            (at your option) any later version.

            This program is distributed in the hope that it will be useful,
            but WITHOUT ANY WARRANTY; without even the implied warranty of
            MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
            GNU General Public License for more details.

            You should have received a copy of the GNU General Public License
            along with this program.  If not, see <https://www.gnu.org/licenses/>.
          `)

          break
        }

        default: {
          console.log('Unknown command. Try the help command?')

          break
        }
      }
    }

    rl.resume()
    rl.prompt()
  })
}

main()
  .catch(err => console.error(err.stack))
