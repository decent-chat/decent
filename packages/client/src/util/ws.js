const Nanobus = require('nanobus')

// we keep a pool of connected websockets so
// we don't end up initiating 100 connects to the
// same server
const pool = new Map() // host -> WS

// WS is just nanobus wrapping a WebSocket
class WS extends Nanobus {
  constructor (host, useSecure) {
    super()

    this.host = host
    this.useSecure = useSecure

    this.connectTo(host)
  }

  connectTo (host) {
    return new Promise((resolve, reject) => {
      const uri = (this.useSecure ? 'wss://' : 'ws://') + host

      this.socket = new WebSocket(uri)

      // listen for events on the socket
      this.socket.addEventListener('open', event => {
        console.log('util/ws: connected', { host })

        this.emit('open', event)
        resolve(event)
      })

      this.socket.addEventListener('message', event => {
        const { evt, data } = JSON.parse(event.data)

        // pass socket messages over to this nanobus
        this.emit(evt, data)
      })

      this.socket.addEventListener('close', event => {
        if (!event.wasClean) {
          console.warn('util/ws: connection closed unexpectedly', { host })

          // try to reconnect
          this.tryReconnect(host)
        }

        this.emit('close', event)
      })
    })
  }

  tryReconnect (host) {
    const reconnect = n => async () => {
      if (n > 5) n = 5 // max out at 5s between retries

      try {
        await this.connectTo(host)

        // :tada:
        this.emit('reconnect')

        console.log('util/ws: reconnected', { host, tries: n })
      } catch (error) {
        // retry - the time we wait between retries will continually increase
        setTimeout(reconnect(n + 1), n * 1000)
      }
    }

    setTimeout(reconnect(1), 1000)
  }

  // sends { evt, data } down the socket
  send (evt, data) {
    const payload = JSON.stringify({ evt, data })

    this.socket.send(payload)
  }
}

module.exports = (host, useSecure) => {
  // if there's already an open websocket connection to this host, use
  // it instead of creating a new one
  if (pool.has(host)) {
    return pool.get(host)
  }

  const ws =  new WS(host, useSecure)

  pool.set(host, ws) // add to pool

  return ws
}
