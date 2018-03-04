const Client = require('decent.js')
const EventEmitter = require('eventemitter3')

class Pool {
  servers = []
  activeIndex = -1

  async add(...hostnames) {
    for (const hostname of hostnames) {
      const client = new Client()

      await client.connectTo(hostname)

      client.channels.on('change', () => {
        if (client === this.activeServer.client) {
          this.activeChannels.emit('change', client.channels)
        }
      })

      client.users.on('change', () => {
        if (client === this.activeServer.client) {
          this.activeUsers.emit('change', client.users)
        }
      })

      client.emotes.on('change', () => {
        if (client === this.activeServer.client) {
          this.activeEmotes.emit('change', client.emotes)
        }
      })

      this.servers.push({
        hostname, client,
        ui: {
          activeChannelIndex: (client.channels.length > 0) ? 0 : -1,
        },
      })
    }

    return this.servers.length - 1
  }

  async setActive(index) {
    if (!this.servers[index]) throw new Error('pool.setActive(): index points to null')

    this.activeIndex = index

    this.activeChannels.emit('change', this.activeServer.client.channels)
    this.activeUsers.emit('change', this.activeServer.client.users)
    this.activeEmotes.emit('change', this.activeServer.client.emotes)
  }

  get activeServer() {
    return this.activeIndex >= 0 ? this.servers[this.activeIndex] : null
  }

  activeChannels = new EventEmitter()
  activeUsers = new EventEmitter()
  activeEmotes = new EventEmitter()
}

module.exports = Pool
