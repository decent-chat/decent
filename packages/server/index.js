'use strict'

process.on('unhandledRejection', err => {
  console.error(err.stack)
})

const Datastore = require('nedb-promise')
const express = require('express')
const WebSocket = require('ws')
const http = require('http')

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

async function main(port = 3000, dir = __dirname) {
  const db = {
    messages: new Datastore({filename: dir + '/messages'}),
    users:    new Datastore({filename: dir + '/users'}),
    sessions: new Datastore({filename: dir + '/sessions'}),
    channels: new Datastore({filename: dir + '/channels'}),
    settings: new Datastore({filename: dir + '/settings'}),
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    next()
  })

  app.enable('trust proxy')
  app.use('/uploads', express.static(dir + '/uploads'))
  await settings.setupDefaultSettings(db.settings)
  await attachAPI(app, {wss, db, dbDir: dir})

  await new Promise(resolve => httpServer.listen(port, resolve))

  return { settings, db, app, httpServer, wss }
}

module.exports = main
