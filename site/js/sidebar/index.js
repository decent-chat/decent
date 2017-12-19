// import choo
const choo = require('choo')
const html = require('choo/html')

// import utils
const history = require('../util/history')
const storage = require('../util/storage')
const { get } = require('../util/api')

// initialize choo
const sidebar = choo()

// initialize state
sidebar.use((state, emitter) => {
  // consult storage for servers list
  {
    const hosts = storage.get('servers') || []

    state.servers = hosts.map(host => ({
      host, active: false,
    }))
  }

  state.loggedIn = false
  state.user = null
  state.sessionID = null

  state.activeServer = null
  state.serverDropdownOpen = false

  history.on('session id update', id => {
    state.sessionID = id

    const server = state.servers[state.activeServer]
    if (server) storage.set('session id: ' + server.host, id)
  })

  history.on('session update', user => {
    state.loggedIn = !!user
    state.user = user

    emitter.emit('render')
  })

  emitter.on('add server', host => {
    // add the server
    const length = state.servers.push({
      host,
      active: false,
    })

    // update storage
    storage.set('servers', state.servers.map(s => s.host))

    console.log('added server', host)

    // switch to it
    emitter.emit('switch server', length - 1)
  })

  emitter.on('toggle server dropdown', () => {
    state.serverDropdownOpen = !state.serverDropdownOpen

    // re-render
    emitter.emit('render')
  })

  emitter.on('switch server', index => {
    const server = state.servers[index]

    // will cause 'navigate', and thus a switch
    history.push(`/${server.host}`)
  })

  history.on('navigate', switchServerBasedOnRoute)

  // switch to a server based on current URL
  switchServerBasedOnRoute()

  async function switchServerBasedOnRoute() {
    const [ host ] = history.path()

    // deactivate the currently active server, if any
    const activeServer = state.servers[state.activeServer]
    if (activeServer) activeServer.active = false

    if (host) {
      // find the server
      let serverIndex = state.servers.findIndex(server => server.host === host)

      if (serverIndex === -1) {
        // we don't have this server stored in the server list - add it
        const length = state.servers.push({ host, active: true })

        // update storage
        storage.set('servers', state.servers.map(s => s.host))

        console.log('added server (from initial path)', host)

        // ...and we will switch to it
        serverIndex = length - 1
      }

      // switch to it
      const server = state.servers[serverIndex]
      state.activeServer = serverIndex
      server.active = true

      console.log('switched to server', host)

      // load session ID from storage
      const sessionID = storage.get('session id: ' + host) || null

      // logout while we fetch session data
      history.emit('session id update', sessionID)
      history.emit('session update', null)

      // load session data
      if (sessionID !== null) {
        // load session data from the server
        try {
          const { user } = await get(host, 'session/' + sessionID)

          history.emit('session update', user)
        } catch (error) {
          console.warn(error)
        }
      }

      // re-render
      emitter.emit('render')
    } else {
      // we're at the root, pick a default server!
      // notice we use history.REPLACE here
      const first = state.servers[0]

      if (first) {
        // default to first server
        history.replace(`/${first.host}`)
      } else {
        // default to current host that we're accessing the client from
        history.replace(`/${location.host}`)
      }
    }
  }
})

// import sections
const serverSection = require('./server')
const channelSection = require('./channel')

// create the sidebar template
const tmpl = (state, emit) => {
  if (state.activeServer === null) {
    // no active server - we probably just loaded from /
    return html`<div id='server-sidebar'></div>`
  }

  return html`<div id='server-sidebar'>
    ${serverSection(state, emit)}
    ${channelSection(state, emit)}
  </div>`
}

sidebar.route('*', tmpl)
module.exports = sidebar
