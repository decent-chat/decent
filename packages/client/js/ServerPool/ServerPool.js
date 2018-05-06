const Client = require('decent.js')
const EventEmitter = require('eventemitter3')
const Atom = require('./Atom')
const { save, load } = require('../storage')

class Pool extends EventEmitter {
  static clientEvents = ['disconnect', 'reconnect', 'namechange', 'login', 'logout']

  servers = []
  activeIndex = -1
  failedServers = []

  get serversSerializable() {
    return this.servers.concat(this.failedServers).map(({ hostname, client }) =>
      ({hostname, sessionID: client ? client._host.sessionID : undefined}))
  }

  async load() {
    for (const { hostname, sessionID } of load('servers', [])) {
      const index = await this.add(hostname)

      if (sessionID) {
        this.servers[index].client.loginWithSessionID(sessionID)
      }
    }

    const activeIndex = load('activeServerIndex', this.servers.length - 1)

    if (activeIndex >= this.servers.length) {
      // ???
      if (this.servers.length > 0) this.setActive(0)
      else this.setActive(-1)
    } else {
      this.setActive(activeIndex)
    }

    // Every 20 seconds, try and connect to failed servers, if any.
    setInterval(() => {
      this.tryReconnect()
    }, 20 * 1000)
  }

  async tryReconnect() {
    const successful = []

    for (const server of this.failedServers) {
      if (!server) return

      try {
        await server.client.connectTo(server.hostname)
      } catch (err) {
        // Still failed; do nothing.
        continue
      }

      // We connected!!
      await this.finalizeConnection(server.client, server.hostname)
      successful.push(server)

      if (!this.activeServer) this.setActive(0)
    }

    // Remove successful ones
    this.failedServers = this.failedServers.filter(s => !successful.includes(s))

    if (successful.length > 0) this.emit('connectionchange')
  }

  async add(hostname, allowFailure = true) {
    const client = new Client()
    let failed = false

    try {
      await client.connectTo(hostname)
    } catch (err) {
      if (!allowFailure) throw err

      console.warn('Failed to connect to', hostname)
      failed = true

      this.failedServers.push({client, hostname})
    }

    if (!failed) await this.finalizeConnection(client, hostname)

    save('servers', this.serversSerializable)

    return this.servers.length - 1
  }

  async finalizeConnection(client, hostname) {
    for (const event of Pool.clientEvents) {
      client.on(event, (...args) => {
        if (this.activeServer && client === this.activeServer.client) {
          this.activeClientEE.emit(event, ...args)
        }
      })
    }

    client.on('login', (user, sessionID) => {
      save('servers', this.serversSerializable)
    })

    client.channels.on('change', () => {
      if (client === this.activeServer.client) {
        this.activeChannelsEE.emit('change', client.channels)
      }
    })

    client.users.on('change', () => {
      if (client === this.activeServer.client) {
        this.activeUsersEE.emit('change', client.users)
      }
    })

    client.emotes.on('change', () => {
      if (client === this.activeServer.client) {
        this.activeEmotesEE.emit('change', client.emotes)
      }
    })

    const ui = {
      activeChannelIndex: new Atom((client.channels.length > 0) ? 0 : -1),
    }

    this._listenToUI(ui)

    const index = this.servers.push({
      hostname, client, ui,
    }) - 1

    client.on('disconnect', () => {
      this.remove(index)
      this.failedServers.push({client, hostname})

      this.emit('connectionchange')
      save('servers', this.serversSerializable)
    })
  }

  async remove(index) {
    this.servers.splice(index, 1)

    if (index === this.activeIndex) {
      if (this.servers[0]) this.setActive(0)
      else this.setActive(-1)
    } else if (index < this.activeIndex) {
      this.activeIndex--
    }

    save('servers', this.serversSerializable)
    save('activeServerIndex', this.activeIndex)
  }

  async removeFailedHost(hostname) {
    this.failedServers = this.failedServers.filter(server => server.hostname !== hostname)
    save('servers', this.serversSerializable)
  }

  async setActive(index) {
    if (!this.servers[index] && index !== -1) throw new Error('pool.setActive(): index points to null')

    this.activeIndex = index
    const server = this.servers[index]

    if (server && server.client.me) this.activeClientEE.emit('login', server.client.me)
    else this.activeClientEE.emit('logout')

    if (server && server.client.connected) this.activeClientEE.emit('reconnect')
    else this.activeClientEE.emit('disconnect')

    if (server) {
      this.activeChannelsEE.emit('change', this.activeServer.client.channels)
      this.activeUsersEE.emit('change', this.activeServer.client.users)
      this.activeEmotesEE.emit('change', this.activeServer.client.emotes)
    }

    save('activeServerIndex', index)
  }

  get activeServer() {
    return this.activeIndex >= 0 ? this.servers[this.activeIndex] : null
  }

  _listenToUI(atom, key = '') {
    if (atom instanceof Atom) {
      // Subscribe to atom changes
      atom.on('change', value => {
        this.activeUIEE.emit(key, value)
      })
    } else {
      // Recursively
      for (const [ subKey, value ] of Object.entries(atom)) {
        this._listenToUI(value, key ? (key + '.' + subKey) : subKey)
      }
    }
  }

  activeUIEE = new EventEmitter()
  activeClientEE = new EventEmitter()
  activeChannelsEE = new EventEmitter()
  activeUsersEE = new EventEmitter()
  activeEmotesEE = new EventEmitter()

  onUIChange(key, f) {
    this.activeUIEE.on(key, f)
    return this
  }
}

module.exports = Pool
