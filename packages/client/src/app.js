const choo = require('nanochoo')
const html = require('bel')
const css = require('sheetify')

const util = require('./util')

// import root components
const Sidebar = require('./components/sidebar')

// create app
const app = choo()

/*
app.use((state, emitter) => {
  state.session = null // { id, user }
  state.ws = null // WS
  state.secure = false
  state.serverRequiresAuthorization = false

  Object.defineProperty(state, 'sessionAuthorized', {
    get: function () {
      if (state.serverRequiresAuthorization) {
        return state._sessionAuthorized
      } else {
        return true
      }
    },

    set: function (value) {
      state._sessionAuthorized = value
    }
  })

  // This whole mess of the _session Proxy and the session property are used to
  // handle the session object being changed; whenever the session ID changes
  // (be it because we set the changed session.id, completely overwrote session,
  // deleted session or session.id, etc), we want to send the new session ID to
  // the server (so that it knows that the user of the old session ID went
  // offline and the user of the new session ID came online).

  state._session = new Proxy({}, {
    set: function (target, key, value) {
      if (key === 'id') {
        if (target.id !== value) {
          state.ws.send('pongdata', { sessionID: value })
        }
      }

      return Reflect.set(target, key, value)
    },

    deleteProperty: function (target, key) {
      if (key === 'id') {
        state.ws.send('pongdata', { sessionID: null })
      }

      return Reflect.deleteProperty(target, key)
    }
  })

  Object.defineProperty(state, 'session', {
    get: function () {
      return state._session
    },

    set: function (newSession) {
      // Delete keys which aren't found on the session.
      for (const key of Object.keys(state._session)) {
        if (newSession === null || Object.keys(newSession).includes(key) === false) {
          delete state._session[key]
        }
      }

      // Then assign the new values.
      // We assign to state.session here because state.session will
      // automatically deal with setting properties nicely.
      Object.assign(state.session, newSession)
    }
  })

  // publish state for debugging/experimenting as well
  window.state = state

  // emit 'navigate' immediately after page load
  emitter.on('DOMContentLoaded', () => {
    emitter.emit('navigate')
  })

  // emit 'route' after state.route/state.params changes
  // different to 'navigate', which fires beforehand
  emitter.prependListener('navigate', () => {
    // this is a hack. see https://github.com/choojs/choo/pull/553
    setTimeout(() => emitter.emit('route'), 25)
  })

  // get websocket connection whenever host changes
  emitter.on('route', async () => {
    handleHostChange: {
      if (state.ws && state.ws.host === state.params.host) {
        break handleHostChange
      }

      const { useAuthorization, authorizationMessage } = (
        await api.get(state, 'should-use-authorization')
      )

      state.serverRequiresAuthorization = useAuthorization

      if (useAuthorization) {
        state.authorizationMessage = authorizationMessage
      }

      state.secure = (
        await api.get(state, 'should-use-secure')
      ).useSecure

      state.ws = new util.WS(state.params.host, state.secure)

      // wait for the WebSocket to connect, because a bunch of things
      // basically don't function without it
      await new Promise(resolve => state.ws.once('open', resolve))

      state.ws.on('*', (evt, timestamp, data) => {
        if (evt === 'pingdata') {
          state.ws.send('pongdata', {
            sessionID: state.session.id
          })
        } else {
          // emit websocket events
          emitter.emit('ws.' + evt, data)

          // for debugging:
          // console.log(`ws[${evt}]:`, data)
        }
      })

      emitter.emit('emotes.fetch')
    }

    emitter.emit('routeready')
  })
})
*/

// connect websockets to global emitter. events:
//  - ws:any:*     (events from any websocket)
//  - ws:HOST:*    (events from websocket connected to HOST)
//  - ws:active:*  (events from the current host's websocket)
app.use((_, emitter) => {
  emitter.on('switchhost', async host => {
    if (host === null) return

    const { useSecure } = await util.api.get('should-use-secure')
    const ws = util.WS(host, useSecure)

    if (useSecure) util.api.enableSecure()

    ws.on('*', (evt, _, data) => {
      emitter.emit('ws:any:' + evt, data)
      emitter.emit(`ws:${host}:` + evt, data)
      if (host === util.api.host) emitter.emit('ws:active:' + evt, data)
    })

    ws.on('pingdata', () => {
      ws.send('pongdata', {
        sessionID: util.storage.get('sessionid/' + host)
      })
    })
  })
})

// declare view
const sidebar = Sidebar(app.emitter)

css('./app.css')

app.view((state, emit) => {
  return html`<div id='app'>
    ${sidebar.render()}
    <main> Hello, world </main>
  </div>`
})

// mount app
app.mount('#app')

// publish some objects for debugging
Object.assign(window, {
  util,
  app,
  emit: (...args) => app.emitter.emit(...args),
  sidebar
})
