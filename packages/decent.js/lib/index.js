const fetch = require('./fetch')
const { version } = require('../package.json')
const typeforce = require('typeforce')
const Socket = require('./socket')

const { Channels } = require('./channels')
const { User, Users } = require('./users')

class Client {
  constructor() {
    this._host = null
    this._socket = new Socket(this)

    // Ping!
    this._socket.on('pingdata', () => {
      // Pong!
      this._socket.send('pongdata', {sessionID: this._sessionID || ''})
    })
  }

  fetch(...k) {
    return fetch(this._host, ...k)
  }

  async connectTo(hostname) {
    typeforce('String', hostname)
    this._host = {hostname}

    // Should we be using HTTPS or plain HTTP?
    const { properties: { useSecure } } = await this.fetch('/api/properties')
    typeforce('Boolean', useSecure)

    this._host.useSecure = useSecure

    // Check version compatability
    const { decentVersion } = await this.fetch('/api/')
    typeforce('String', decentVersion)

    const majorVersions = [version, decentVersion].map(v => parseInt(v.split('.')[0]))

    if (majorVersions[0] < majorVersions[1]) {
      throw Object.assign(new Error(), {
        name: 'ClientOutdatedError',
        message: `Cannot connect to a server with a higher major version number (${majorVersions[1]}) than decent.js (${majorVersions[0]})`,
      })
    } else if (majorVersions[0] > majorVersions[1]) {
      throw Object.assign(new Error(), {
        name: 'ServerOutdatedError',
        message: `Cannot connect to a server with a lower major version number (${majorVersions[1]}) than decent.js (${majorVersions[0]})`,
      })
    }

    // Setup socket
    await this._socket.connect()

    // We're done - export the API:

    this.channels = new Channels(this)
    this.users = new Users(this)

    await this.channels.load()
    await this.users.load()
  }

  async login(username, password) {
    typeforce('String', username)
    typeforce('String', password)

    const { sessionID } = await this.fetch('/api/sessions', {
      method: 'POST',
      body: {username, password},
    })

    return await this.loginWithSessionID(sessionID)
  }

  async loginWithSessionID(sessionID) {
    typeforce('String', sessionID)

    const { user } = await this.fetch('/api/sessions/' + sessionID)

    this._host.sessionID = sessionID
    return this._sessionUser = new User(this, user)
  }

  get me() {
    return this._sessionUser || null
  }
}

module.exports = Client
