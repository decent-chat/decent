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

      state.ws.on('*', (evt, timestamp, data) => {
        if (evt === 'ping for data') {
          state.ws.send('pong data', {
            sessionID: state.session ? state.session.id : null
          })
        } else {
          // emit websocket events
          emitter.emit('ws.' + evt.replace(/ /g, ''), data)
        }
      })

      // wait for the WebSocket to connect, because a bunch of things
      // basically don't function without it
      await new Promise(resolve => state.ws.once('open', resolve))

      emitter.emit('emotes.fetch')
    }

    emitter.emit('routeready')
  })
})

app.use(messages.store)
app.use(sidebar.store)
app.use(accountSettings.store)

for (const [ name, s ] of Object.entries(srvSettings)) {
  if (s.store) {
    app.use(s.store)
  }
}

// declare routes
{
  const prefix = css('./app.css')

  const notFound = (state, emit) => html`<div class=${prefix}>
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

    return html`<div class=${prefix}>
      ${sidebar.component(state, emit)}
      <main></main>
    </div>`
  })

  // server with channel open
  app.route('/servers/:host/channels/:channel', (state, emit) => {
    return html`<div class=${prefix}>
      ${sidebar.component(state, emit)}
      <main>
        ${messages.component(state, emit)}
        ${state.messages.list !== null ? messageEditor.component(state, emit) : html`<span></span>`}
      </main>
    </div>`
  })

  // server account settings page
  app.route('/servers/:host/account', (state, emit) => {
    return html`<div class=${prefix}>
      ${sidebar.component(state, emit)}
      <main>
        ${accountSettings.component(state, emit)}
      </main>
    </div>`
  })

  // server settings (admins only) page
  app.route('/servers/:host/settings/:setting', (state, emit) => {
    if (!state.session || state.session.user.permissionLevel !== 'admin' || !srvSettings[state.params.setting]) {
      return notFound(state, emit)
    }

    // only show authorized users page on servers which require authorization
    if (state.params.setting === 'authorizedUsers' && !state.serverRequiresAuthorization) {
      return notFound(state, emit)
    }

    return html`<div class=${prefix}>
      ${sidebar.component(state, emit)}
      <main>
        ${srvSettings[state.params.setting].component(state, emit)}
      </main>
    </div>`
  })

  // server
  app.route('/servers/:host', (state, emit) => {
    return html`<div class=${prefix}>
      ${sidebar.component(state, emit)}
      <main></main>
    </div>`
  })
}

// mount app
app.mount('#app')
