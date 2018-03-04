const fetch = require('./fetch')
const { version } = require('../package.json')
const typeforce = require('typeforce')
const Socket = require('./socket')
const FormData = require('isomorphic-form-data')
const { EventEmitter } = require('./emitter')

const { Emotes } = require('./emotes')
const { Message, Channels } = require('./channels')
const { User, Users } = require('./users')

// Typeforce relies on this function being callable.
if (!Error.captureStackTrace) Error.captureStackTrace = () => console.trace()

class Client extends EventEmitter {
  constructor() {
    super()

    Object.defineProperty(this, '_host', {value: null, writable: true})
    Object.defineProperty(this, '_socket', {value: new Socket(this)})
    Object.defineProperty(this, '_sessionUser', {value: null, writable: true})

    this.serverName = undefined
    this.serverVersion = undefined

    // Ping!
    this._socket.on('pingdata', () => {
      // Pong!
      this._socket.send('pongdata', {sessionID: this._host.sessionID || ''})
    })

    this._socket.on('disconnect', () => this.emit('disconnect'))
    this._socket.on('reconnect', () => this.emit('reconnect'))

    this._socket.on('server-settings/update', ({ settings: { name } }) => {
      if (this._serverName !== name) {
        this.serverName = name
        this._socket.emit('namechange', name)
      }
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

    this.serverVersion = decentVersion

    // Load server details
    const { settings: { name } } = await this.fetch('/api/settings')
    typeforce('String', name)
    this.serverName = name

    // Setup socket
    await this._socket.connect()

    // We're done - export the API:

    this.emotes = new Emotes(this)
    this.channels = new Channels(this)
    this.users = new Users(this)

    await this.emotes.load()
    await this.channels.load()
    await this.users.load()
  }

  async register(username, password) {
    typeforce('String', username)
    typeforce('String', password)

    const { user } = await this.fetch('/api/users', {
      method: 'POST',
      body: {username, password},
    })

    return new User(this, user)
  }

  async login(username, password) {
    typeforce('String', username)
    typeforce('String', password)

    const { sessionID } = await this.fetch('/api/sessions', {
      method: 'POST',
      body: {username, password},
    }).catch(error => {
      if (error.code === 'NOT_FOUND') {
        error.message = `Cannot login as "${username}" because that user does not exist.`
      }

      return Promise.reject(error)
    })

    return await this.loginWithSessionID(sessionID)
  }

  async loginWithSessionID(sessionID) {
    typeforce('String', sessionID)

    const { user: userObj } = await this.fetch('/api/sessions/' + sessionID)
    const user = new User(this, userObj)

    this._host.sessionID = sessionID
    this._sessionUser = user

    this.emit('login', user)
    return user
  }

  async logout(deleteSessionID = true) {
    typeforce('Boolean', deleteSessionID)

    if (deleteSessionID) {
      await this.fetch('/api/sessions/' + this._host.sessionID, {method: 'DELETE'})
    }

    this._host.sessionID = undefined
    this._sessionUser = undefined

    this.emit('logout')
  }

  async getMessageByID(id) {
    typeforce('String', id)

    const { message } = await this.fetch('/api/messages/' + id)
    return new Message(this, message)
  }

  async setServerName(name) {
    typeforce('String', name)

    await this.fetch('/api/settings', {
      method: 'POST',
      body: {name}
    })

    this.serverName = name
  }

  async uploadImage(file) {
    const form = new FormData()

    // The server will typecheck for us.
    form.append('image', file)

    const { path } = await this.fetch('/api/upload-image', {
      method: 'POST',
      body: form,
    })

    return (this._host.useSecure ? 'https://' : 'http://') + this._host.hostname + path
  }

  get me() {
    return this._sessionUser || null
  }
}

module.exports = Client
