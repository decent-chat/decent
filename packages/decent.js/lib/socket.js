const WebSocket = require('isomorphic-ws')
const EventEmitter = require('eventemitter3')

const sleep = s => new Promise(t => setTimeout(t, s))
const once = (ee, evt, f) => {
  let done = false
  ee.addEventListener(evt, (...args) => {
    if (!done) {
      done = true
      f(...args)
    }
  })
}

class Socket extends EventEmitter {
  constructor(client) {
    super()
    this.client = client
  }

  connect(listenClose = true) {
    return new Promise((resolve, reject) => {
      const protocol = this.client._host.useSecure ? 'wss' : 'ws'

      this._ws = new WebSocket(`${protocol}://${this.client._host.hostname}`)
      once(this._ws, 'open', resolve)
      once(this._ws, 'error', reject)

      once(this._ws, 'close', async event => {
        if (listenClose && !event.wasClean) {
          // Attempt to reconnect
          this.emit('disconnect')

          for (let tries = 0; true; tries++) {
            try {
              await this.connect(false)

              // Yay!
              this.emit('reconnect')
              break
            } catch (_) {
              await sleep(Math.min(tries, 5) * 1000)
            }
          }
        }
      })

      // Listen for messages, parse them, and then re-emit them.
      this._ws.addEventListener('message', ({ data: message }) => {
        const { evt, data } = JSON.parse(message)

        if (this._ws.readyState === 0) return

        this.emit(evt, data)
      })
    })
  }

  send(evt, data) {
    const message = JSON.stringify({evt, data})

    this._ws.send(message)
  }
}

module.exports = Socket
