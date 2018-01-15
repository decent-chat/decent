'use strict'

process.on('unhandledRejection', err => {
  console.error(err.stack)
})

const Datastore = require('nedb-promise')
const express = require('express')
const WebSocket = require('ws')
const http = require('http')
const cors = require('cors')

const attachAPI = require('./api')
const settings = require('./settings')

const app = express()
const httpServer = http.createServer(app)

// WebSockets are not limited by the Same Origin Policy (i.e.
// CORS) -- it's up to the server to reject/accept connections
// on its own. This is great for us because we want to accept
// every connection regardless of origin, since servers/clients
// should be able to communicate cross-domain.
const wss = new WebSocket.Server({server: httpServer})

async function main(port = 3000, dbDir = __dirname) {
  const db = {
    messages: new Datastore({filename: dbDir + '/messages'}),
    users:    new Datastore({filename: dbDir + '/users'}),
    sessions: new Datastore({filename: dbDir + '/sessions'}),
    channels: new Datastore({filename: dbDir + '/channels'}),
    settings: new Datastore({filename: dbDir + '/settings'}),
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  app.use(cors())
  app.options('*', cors())

  app.enable('trust proxy')
  app.use('/uploads', express.static(dbDir + '/uploads'))
  await settings.setupDefaultSettings(db.settings)
  await attachAPI(app, {wss, db, dbDir})

  await new Promise(resolve => httpServer.listen(port, resolve))

  return { settings, db, app, httpServer, wss }
}

module.exports = main
