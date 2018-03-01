#!/usr/bin/env node

const server = require('@decent/server')
const client = require('@decent/client')
const express = require('express')
const readline = require('readline')
const fixWS = require('fix-whitespace')

const port = parseInt(process.argv[2]) || 3000
const dbDir = process.argv[3] || server.DB_IN_MEMORY

server(port, dbDir).then(async ({ settings, app, db, serialize, sendToAllSockets }) => {
  console.log(`Listening on port ${port} (try "license" or "help" for info)`)

  if (dbDir === server.DB_IN_MEMORY) {
    console.log('Using in-memory database; image uploading is disabled')
  }

  app.use(express.static(client)) // index.html, dist/, img/
  app.get(/^(?!\/api)/, (req, res) => res.sendFile(client + '/index.html'))

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.setPrompt('decent> ')
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
            the Decent chat system. This is NOT a text-based
            interface for chatting; use an actual client for that.
            Commands:
            - license: shows license information (hint: it's GPL 3.0!)
            - make-admin: makes an already-registered user an admin and
              authorizes them as a member of the server.
            - unmake-admin: demotes an admin to member status.
            - get-property: shows a server property.
            - set-property: sets a server property.
            - list-properties: lists all server properties and their
              values.
              ("-property" can be omitted from these, and
               "show" is an alias for "get".)
          `)

          break
        }

        case 'license': {
          console.log(fixWS`
            Decent - the decentralized chat system that's absolutely okay
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

          const result = await settings.setSetting(db.settings, settings.serverPropertiesID, key, value)

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

          const serverProperties = await db.settings.findOne({_id: settings.serverPropertiesID})

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
          const serverProperties = await db.settings.findOne({_id: settings.serverPropertiesID})

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
              permissionLevel: 'admin',
              authorized: true
            }
          })

          user.authorized = true
          user.permissionLevel = 'admin'
          sendToAllSockets('user/update', {user: await serialize.user(user)})

          console.log(`Made ${username} an admin.`)

          break
        }

        case 'unmake-admin': {
          if (parts.length !== 2) {
            console.error('Expected (unmake-admin <username>)')
            break
          }

          const username = parts[1]

          const user = await db.users.findOne({username})

          if (!user || user.permissionLevel !== 'admin') {
            console.error('Error: There is no admin with username ' + username)
            break
          }

          await db.users.update({username}, {
            $set: {
              permissionLevel: 'member',
            }
          })

          user.permissionLevel = 'member'
          sendToAllSockets('user/update', {user: await serialize.user(user)})

          console.log(`Demoted ${username} from admin to member.`)

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
}).catch(err => {
  console.error(err.trace || err)
  process.exit(1)
})
