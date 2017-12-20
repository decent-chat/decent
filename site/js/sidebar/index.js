// import choo
const choo = require('choo')
const html = require('choo/html')

// import utils
const history = require('../util/history')
const storage = require('../util/storage')
const { get } = require('../util/api')
const WS = require('../util/ws')

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

  state.activeServer = null // index
  state.serverDropdownOpen = false

  state.channels = []
  state.activeChannelID = null
  state.activeChannelName = null // incl. #
  state.ws = null

  history.on('session id update', id => {
    state.sessionID = id

    const server = state.servers[state.activeServer]
    if (server) storage.set('session id: ' + server.host, id)

    // update socket's session id too
    const activeServer = state.servers[state.activeServer]

    if (activeServer) {
      const { host } = activeServer
      const ws = new WS(host) // gets current WS connection if it exists
    }

    // fetch channel list
    fetchChannelList() // there may be new notifications for this user
  })

  history.on('session update', user => {
    state.loggedIn = !!user
    state.user = user

    emitter.emit('render')
  })

  emitter.on('switch server', index => {
    if (state.activeServer === index) return // we're already on this server

    const server = state.servers[index]

    // will cause 'navigate', and thus a switch
    history.push(`/${server.host}`)
  })

  history.on('host update', async host => {
    // deactivate the currently active server, if any
    const activeServer = state.servers[state.activeServer]
    if (activeServer) activeServer.active = false

    state.activeServer = null
    state.activeChannelID = null
    state.activeChannelName = null

    // remove websocket channellist-related event listeners
    // and forget the old server's websocket connection
    if (state.ws) {
      state.ws.removeListener('created new channel', fetchChannelList)
      state.ws.removeListener('renamed channel', handleChannelRenamed)
      state.ws.removeListener('deleted channel', fetchChannelList)
      state.ws = null
    }

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
      state.channels = [] // will fetch due to session update

      // listen for channellist-related events on websocket
      state.ws = new WS(host)
      state.ws.on('created new channel', fetchChannelList)
      state.ws.on('renamed channel', handleChannelRenamed)
      state.ws.on('deleted channel', fetchChannelList)
      state.ws.on('ping for data', pongData)

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
  })

  history.on('channel update', channelName => {
    if (!channelName) {
      return
    }

    state.activeChannelName = channelName  // used by fetchChannelList (note, includes '#')
    console.log('switched to channel/page:', channelName)

    if (!channelName.startsWith('#')) {
      // not a channel, probably a settings page or something
      // (note: they haven't been implemented yet)
      state.activeChannelName = channelName
      state.activeChannelID = null
      return
    }

    // find to-activate channel by name
    const channel = state.channels
      .find(c => c.name === channelName.substr(1)) // channelName includes the '#'

    if (!channel) {
      // we haven't fetched the channel list yet - we'll deal with activation there
      // see fetchChannelList
      console.warn('channel list not fetched yet but active channel =', channelName)
      return
    }

    // set this channel as active
    state.activeChannelID = channel.id

    emitter.emit('render')
  })

  async function fetchChannelList() {
    const { host } = state.servers[state.activeServer]
    const data = state.sessionID ? { sessionID: state.sessionID } : {}
    const { channels } = await get(host, 'channel-list', data)

    // [ { id, name, ?unreadMessageCount } ]
    state.channels = channels

    // update activeChannelID
    const [ , page ] = history.path()
    if (page && page.startsWith('#')) {
      const activeChannel = channels.find(name => page.substr(1))

      state.activeChannelID = activeChannel.id
    }

    emitter.emit('render')
  }

  async function handleChannelRenamed({ channelID, newName }) {
    await fetchChannelList()

    // if we were currently viewing the renamed channel, update window.location
    if (state.activeChannelID === channelID) {
      const { host } = state.servers[state.activeServer]

      history.replace(`/${host}/#${newName}`)
    }
  }

  async function pongData() {
    state.ws.send('pong data', {
      sessionID: state.sessionID // Could be null, of course.
    })
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
