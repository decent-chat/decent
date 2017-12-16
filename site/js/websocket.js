'use strict'

const ws = {
  pool: new Map(), // String serverURL -> WebSocket | 'reconnecting' | 'closed'

  init() {
    RiotControl.on('switch_server', serverURL => ws.connectTo(serverURL))
  },

  connectTo(serverURL, reuseExisting = true) {
    const pool = ws.pool

    if (pool.get(serverURL)) {
      if (reuseExisting) {
        // We already have a WebSocket connected to this
        // server, so we can just ignore it.
        return pool.get(serverURL)
      } else {
        pool.get(serverURL).close()
        pool.set(serverURL, null)
      }
    }

    // Initiate a WebSocket connection to this server.
    // TODO: ask /api/should-use-secure whether to use
    //       the normal WS protocol or WSS
    const socket = new WebSocket('ws://' + serverURL)

    socket.addEventListener('open', () => {
      RiotControl.trigger('socket_open', { serverURL, socket })
    })

    socket.addEventListener('message', event => {
      const { evt, data } = JSON.parse(event.data)

      RiotControl.trigger('socket_message', { serverURL, socket, evt, data })
    })

    socket.addEventListener('close', evt => {
      pool.set(serverURL, 'closed')

      if (!evt.wasClean) {
        // Try to reconnect!
        ws.tryReconnect(serverURL)
      }

      RiotControl.trigger('socket_close', { serverURL, socket, evt })
    })

    pool.set(serverURL, socket)
    return socket
  },

  tryReconnect(serverURL) {
    if (ws.pool.get(serverURL) === 'reconnecting') {
      // We're already trying to reconnect to this server.
      return
    }

    ws.pool.set(serverURL, 'reconnecting')

    const doReconnect = n => () => {
      try {
        ws.connectTo(serverURL)
        console.info('Re-established WebSocket connection', { serverURL })
      } catch (error) {
        console.error('Could not re-establish WebSocket connection', { serverURL, error })
        setTimeout(doReconnect(n + 1), n * SECOND) // Retry after n seconds.
      }
    }

    setTimeout(doReconnect(2), 2 * SECOND)
  },
}
