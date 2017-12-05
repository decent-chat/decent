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
    if (evt !== 'pong data') {
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

    // Attempt to reconnect every couple seconds.
    const intervalID = setInterval(() => {
      if (!this.isDead) {
        // We're alive now, no need to try again.
        clearInterval(intervalID)

        return
      }

      this.reconnect().then(() => {
        // Connection re-established! :tada:
        // (reconnect() automatically sets this.isDead = false)
        console.info('socket:: connection re-established after death')
      })
    }, 2000)
  }

  reconnect() {
    if (this.ws) {
      this.ws.close(1000, 'reconnecting')
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.isDead = false

      const closeHandler = evt => {
        ws.removeEventListener('close', closeHandler)
        ws.removeEventListener('message', messageHandler)

        if (!evt.wasClean) {
          this.diedHandler()
        }
      }

      const messageHandler = message => {
        const { evt, data } = JSON.parse(message.data)

        if (evt !== 'ping for data') {
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
