'use strict'

process.on('unhandledRejection', err => {
  console.error(err.stack)
})

const Datastore = require('nedb-promise')
const express = require('express')
const WebSocket = require('ws')
const http = require('http')
const readline = require('readline')
const fixWS = require('fix-whitespace')

const attachAPI = require('./api')
const { setupDefaultSettings, serverPropertiesID, setSetting } = require('./settings')

const app = express()
const httpServer = http.createServer(app)

// WebSockets are not limited by the Same Origin Policy (i.e.
// CORS) -- it's up to the server to reject/accept connections
// on its own. This is great for us because we want to accept
// every connection regardless of origin, since servers/clients
// should be able to communicate cross-domain.
const wss = new WebSocket.Server({ server: httpServer })

async function main() {
  const db = {
    messages: new Datastore({filename: 'db/messages'}),
    users:    new Datastore({filename: 'db/users'}),
    sessions: new Datastore({filename: 'db/sessions'}),
    channels: new Datastore({filename: 'db/channels'}),
    settings: new Datastore({filename: 'db/settings'}),
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  app.enable('trust proxy')
  app.use(express.static('site'))
  await setupDefaultSettings(db.settings)
  await attachAPI(app, {wss, db})

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
            - get-property: shows a server property.
            - set-property: sets a server property.
              ("-property" can be omitted from both of these, and
                "show" is an alias for "get".)
            - list-properties: lists all server properties and their
              values.
          `)

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

        case 'set':
        case 'set-property': {
          if (parts.length !== 3) {
            console.error(`Expected (${parts[0]} <key> <value>)`)
            break
          }

          const [ key, value ] = parts.slice(1)

          const result = await setSetting(db.settings, serverPropertiesID, key, value)

          if (result === 'updated') {
            console.log('Set.')
          } else {
            console.log('Error: ' + result)
          }

          break
        }

        case 'get':
        case 'show':
        case 'get-property':
        case 'show-property': {
          if (parts.length !== 2) {
            console.error(`Expected (${parts[0]} <key>)`)

            break
          }

          const key = parts[1]

          const serverProperties = await db.settings.findOne({_id: serverPropertiesID})

          if (key === '_id' || key in serverProperties === false) {
            console.error('Not a valid property key:', key)

            break
          }

          const value = serverProperties[key]

          console.log(`${key}:`, value)

          break
        }

        case 'list':
        case 'list-properties': {
          const serverProperties = await db.settings.findOne({_id: serverPropertiesID})

          for (const [key, value] of Object.entries(serverProperties)) {
            if (key === '_id') {
              continue
            }

            console.log(`${key}:`, value)
          }

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
