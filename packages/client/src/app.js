const choo = require('choo')
const devtools = require('choo-devtools')
const html = require('choo/html')
const css = require('sheetify')

// import util
const util = require('./util')
const { api } = util

// publish util for debugging/experimenting
Object.assign(window, { util })

// import root-level components
const messages = require('./components/messages')
const messageEditor = require('./components/message-editor')
const sidebar = require('./components/sidebar')
const userList = require('./components/user-list')
const accountSettings = require('./components/account-settings')
const srvSettings = {
  emotes: require('./components/srv-settings/emotes'),
  authorizedUsers: require('./components/srv-settings/authorized-users'),
}

// create app
const app = choo()

app.use(devtools())

app.use((state, emitter) => {
  state.session = null // { id, user }
  state.ws = null // WS
  state.secure = false
  state.serverRequiresAuthorization = false

  Object.defineProperty(state, 'sessionAuthorized', {
    get: function() {
      if (state.serverRequiresAuthorization) {
        return state._sessionAuthorized
      } else {
        return true
      }
    },

    set: function(value) {
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
    set: function(target, key, value) {
      const ret = Reflect.set(target, key, value)

      if (key === 'user') {
        if (target.id !== value) {
          state.ws.send('pongdata', { sessionID: value })
          emitter.emit('sessionuserloaded')
        }
      }

      return ret
    },

    deleteProperty: function(target, key) {
      if (key === 'id') {
        state.ws.send('pongdata', { sessionID: null })
      }

      return Reflect.deleteProperty(target, key)
    }
  })

  Object.defineProperty(state, 'session', {
    get: function() {
      return state._session
    },

    set: function(newSession) {
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

      const { useSecure, useAuthorization, authorizationMessage } = await api.get(state, 'properties')

      state.serverRequiresAuthorization = useAuthorization
      state.secure = useSecure

      if (useAuthorization) {
        state.authorizationMessage = authorizationMessage
      }

      state.ws = new util.WS(state.params.host, state.secure)

      // wait for the WebSocket to connect, because a bunch of things
      // basically don't function without it
      await new Promise(resolve => state.ws.once('open', resolve))

      state.ws.on('*', (evt, data, timestamp) => {
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

app.use(messages.store)
app.use(sidebar.store)
app.use(userList.store)
app.use(accountSettings.store)

for (const [ name, s ] of Object.entries(srvSettings)) {
  if (s.store) {
    app.use(s.store)
  }
}

// declare routes
{
  const notFound = (state, emit) => html`<div id='app'>
    ${sidebar.component(state, emit)}
    <main>
      <div class='page'>
        <h3> Not found </h3>
      </div>
    </main>
  </div>`

  // 404 (TODO: make prettier)
  app.route('*', (state, emit) => {
    return notFound(state, emit)
  })

  // no server
  app.route('/', (state, emit) => {
    state.session = null

    return html`<div id='app'>
      ${sidebar.component(state, emit)}
      <main></main>
    </div>`
  })

  // server
  app.route('/servers/:host', (state, emit) => {
    return html`<div id='app'>
      ${sidebar.component(state, emit)}
      <main></main>
      ${userList.component(state, emit)}
    </div>`
  })

  // server with channel open
  app.route('/servers/:host/channels/:channel', (state, emit) => {
    return html`<div id='app'>
      ${sidebar.component(state, emit)}
      <main>
        ${messages.component(state, emit)}
        ${state.messages.list !== null ? messageEditor.component(state, emit) : html`<span></span>`}
      </main>
      ${userList.component(state, emit)}
    </div>`
  })

  // server account settings page
  app.route('/servers/:host/account', (state, emit) => {
    if (!state.session.user) {
      return notFound(state, emit)
    }

    return html`<div id='app'>
      ${sidebar.component(state, emit)}
      <main>
        ${accountSettings.component(state, emit)}
      </main>
    </div>`
  })

  // server settings (admins only) page
  app.route('/servers/:host/settings/:setting', (state, emit) => {
    if (!state.session.id || state.session.user.permissionLevel !== 'admin' || !srvSettings[state.params.setting]) {
      return notFound(state, emit)
    }

    // only show authorized users page on servers which require authorization
    if (state.params.setting === 'authorizedUsers' && !state.serverRequiresAuthorization) {
      return notFound(state, emit)
    }

    return html`<div id='app'>
      ${sidebar.component(state, emit)}
      <main>
        ${srvSettings[state.params.setting].component(state, emit)}
      </main>
    </div>`
  })
}

// mount app
app.mount('#app')

css('./app.css')
