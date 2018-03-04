const Client = require('decent.js')
const EventEmitter = require('eventemitter3')
const Atom = require('./atom')

class Pool {
  static clientEvents = ['disconnect', 'reconnect', 'namechange', 'login', 'logout']

  servers = []
  activeIndex = -1

  async add(...hostnames) {
    for (const hostname of hostnames) {
      const client = new Client()

      await client.connectTo(hostname)

      for (const event of Pool.clientEvents) {
        client.on(event, (...args) => {
          if (client === this.activeServer.client) {
            this.activeClientEE.emit(event, ...args)
          }
        })
      }

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

      this.servers.push({
        hostname, client,
        ui,
      })
    }

    return this.servers.length - 1
  }

  async setActive(index) {
    if (!this.servers[index]) throw new Error('pool.setActive(): index points to null')

    this.activeIndex = index
    const server = this.servers[index]

    if (server.client.me) this.activeClientEE.emit('login', server.client.me)
    else this.activeClientEE.emit('logout')

    if (server.client.connected) this.activeClientEE.emit('reconnect')
    else this.activeClientEE.emit('disconnect')

    this.activeChannelsEE.emit('change', this.activeServer.client.channels)
    this.activeUsersEE.emit('change', this.activeServer.client.users)
    this.activeEmotesEE.emit('change', this.activeServer.client.emotes)
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
