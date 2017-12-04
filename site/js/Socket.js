// socket.io-like wrapper around the native window.WebSocket.

export default class Socket {
  constructor(url) {
    this.handlers = {}
    this.url = url
    this.isDead = false

    this.reconnect()
  }

  on(evt, callbackFn) {
    this.handlers[evt] = this.handlers[evt] || []
    this.handlers[evt].push(callbackFn)
  }

  // Note: socket.io calls this `emit`.
  send(evt, data) {
    if (evt !== 'ping') {
      console.info('socket.send[' + evt + ']::', data)
    }

    this.ws.send(JSON.stringify({
      evt, data,
    }))
  }

  diedHandler() {
    if (this.isDead) {
      return
    }

    this.isDead = true
    console.error('socket:: is dead')

    // TODO:
    // Display some kind of onscreen notification that
    // the connection to the server has been lost.

    // Attempt to reconnect in a couple seconds.
    const attemptReconnect = () => {
      setTimeout(() => this.reconnect().then(() => {
        // Connection re-established! :tada:
        this.isDead = false
        console.info('socket:: connection re-established after death')
      }).catch(attemptReconnect), 2000)
    }

    attemptReconnect()
  }

  reconnect() {
    if (this.ws) {
      this.ws.close(1000, 'reconnecting')
    }

    return new Promise((resolve, reject) => {
      let ws
      try {
        ws = new WebSocket(this.url)
      } catch (error) {
        reject(error)
      }

      const closeHandler = evt => {
        ws.removeEventListener('close', closeHandler)
        ws.removeEventListener('message', messageHandler)

        if (!evt.wasClean) {
          this.diedHandler()
        }
      }

      const messageHandler = message => {
        const { evt, data } = JSON.parse(message.data)

        this.lastMessage = Date.now()

        if (evt !== 'pong') {
          console.info('socket[' + evt + ']::', data)
        }

        this.handlers[evt] = this.handlers[evt] || []
        for (const handlerFn of this.handlers[evt]) {
          handlerFn(data)
        }
      }

      ws.addEventListener('open', () => resolve())
      ws.addEventListener('close', closeHandler)
      ws.addEventListener('message', messageHandler)

      this.ws = ws
    })
  }

  close() {
    this.ws.close()
    this.ws = null
  }
}
