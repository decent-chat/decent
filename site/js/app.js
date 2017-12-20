const choo = require('choo')
const devtools = require('choo-devtools')
const html = require('choo/html')
const css = require('sheetify')

// import util
const util = require('./util')
Object.assign(window, { util }) // publish util for debugging/experimenting

// import root-level components
const messages = require('./components/messages')
const messageEditor = require('./components/message-editor')
const sidebar = require('./components/sidebar')

// create app
const app = choo()

app.use(devtools())

app.use((state, emitter) => {
  state.session = null // { id, user }
  state.ws = null // WS
  state.secure = false

  // emit 'navigate' immediately after page load
  emitter.on('DOMContentLoaded', () => {
    emitter.emit('navigate')
  })

  // emit 'route' after state.route/state.params changes
  // different to 'navigate', which fires beforehand
  emitter.prependListener('navigate', () => {
    setTimeout(() => emitter.emit('route'), 25) // X
  })

  // get websocket connection whenever host changes
  emitter.prependListener('route', () => {
    if (state.ws && state.ws.host === state.params.host) return // host has not changed

    state.ws = new util.WS(state.params.host)

    state.ws.on('open', () => state.secure = state.ws.secure)

    state.ws.on('*', (evt, timestamp, data) => {
      if (evt === 'ping for data') return

      // emit websocket events
      emitter.emit('ws.' + evt.replace(/ /g, ''), data)
    })
  })
})

app.use(messages.store)
app.use(sidebar.store)

// declare routes
{
  const prefix = css('./app.css')

  // 404 (TODO: make prettier)
  app.route('*', (state, emit) => {
    return html`<div class=${prefix}>
      <main>
        <h1>Not found</h1>
      </main>
    </div>`
  })

  // no server
  app.route('/', (state, emit) => {
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
