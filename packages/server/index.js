'use strict'

process.on('unhandledRejection', err => {
  console.error(err.stack)
})

const Datastore = require('nedb-promise')
const express = require('express')
const WebSocket = require('ws')
const http = require('http')
const cors = require('cors')
const p = require('util').promisify

const attachAPI = require('./api')
const settings = require('./settings')
const { DB_IN_MEMORY } = attachAPI

async function main(port = 3000, dbDir) {
  if (!dbDir) throw new TypeError('dbDir argument required')

  const db = dbDir === DB_IN_MEMORY ? {
    messages: new Datastore(),
    users:    new Datastore(),
    sessions: new Datastore(),
    channels: new Datastore(),
    settings: new Datastore(),
  } : {
    messages: new Datastore({filename: dbDir + '/messages'}),
    users:    new Datastore({filename: dbDir + '/users'}),
    sessions: new Datastore({filename: dbDir + '/sessions'}),
    channels: new Datastore({filename: dbDir + '/channels'}),
    settings: new Datastore({filename: dbDir + '/settings'}),
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  const app = express()
  const httpServer = http.createServer(app)

  // WebSockets are not limited by the Same Origin Policy (i.e.
  // CORS) -- it's up to the server to reject/accept connections
  // on its own. This is great for us because we want to accept
  // every connection regardless of origin, since servers/clients
  // should be able to communicate cross-domain.
  const wss = new WebSocket.Server({server: httpServer})

  app.use(cors())
  app.options('*', cors())

  app.enable('trust proxy')
  if (dbDir !== main.DB_IN_MEMORY) app.use('/uploads', express.static(dbDir + '/uploads'))
  await settings.setupDefaultSettings(db.settings)
  await attachAPI(app, {wss, db, dbDir})

  await new Promise(resolve => httpServer.listen(port, resolve))

  return { settings, db, app, httpServer, wss, kill: () => {
    return Promise.all([
      p(httpServer.close),
      p(wss.close),
    ])
  }}
}

module.exports = main
Object.assign(module.exports, { DB_IN_MEMORY })
