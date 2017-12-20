const Nanobus = require('nanobus')
const api = require('./api')

// we keep a pool of connected websockets so
// we don't end up initiating 100 connects to the
// same server
const pool = new Map() // host -> WS

// WS is just nanobus wrapping a WebSocket
class WS extends Nanobus {
  constructor(host) {
    super()

    if (pool.has(host)) {
      // we already have a WS connected to this server,
      // so we can just use that one
      const parent = pool.get(host)

      this.socket = parent.socket
      parent.on('open', () => this.socket = parent.socket)

      parent.on('*', (evt, t, data) => {
        this.emit(evt, data)
      })
    } else {
      pool.set(host, this) // add to pool
      this.connectTo(host)
    }
  }

  connectTo(host) {
    return new Promise((resolve, reject) => {
      api.get(host, 'should-use-secure').then(({ useSecure }) => {
        const uri = (useSecure ? 'wss://' : 'ws://') + host

        this.socket = new WebSocket(uri)

        // listen for events on the socket
        this.socket.addEventListener('open', event => {
          console.info('connected websocket', { host })

          this.emit('open', event)
          resolve(event)
        })

        this.socket.addEventListener('message', event => {
          const { evt, data } = JSON.parse(event.data)

          console.debug('socket:', evt, data)

          // pass socket messages over to this nanobus
          this.emit(evt, data)
        })

        this.socket.addEventListener('close', event => {
          if (!event.wasClean) {
            // try to reconnect
            this.tryReconnect(host)
          }

          this.emit('close', event)
        })
      }).catch(reject)
    })
  }

  tryReconnect(host) {
    const reconnect = n => async () => {
      if (n > 5) n = 5 // max out at 5s between retries

      try {
        await this.connectTo(host)

        // :tada:
        this.emit('reconnect')

        console.info('reconnected websocket', { host, tries: n })
      } catch (error) {
        console.error('failed to reconnect websocket', { host, error })

        // retry - the time we wait between retries will continually increase
        setTimeout(reconnect(n + 1), n * 1000)
      }
    }

    setTimeout(reconnect(1), 1000)
  }

  // sends { evt, data } down the socket
  send(evt, data) {
    const payload = JSON.stringify({ evt, data })

    this.socket.send(payload)
  }
}

module.exports = WS
