// sidebar component
const html = require('choo/html')
const raw = require('choo/html/raw')
const mrk = require('../util/mrk')
const { Modal, api, storage } = require('../util')

const store = (state, emitter) => {
  const reset = () => state.sidebar = {
    // array of server hosts
    servers: storage.get('servers') || [],

    // used to see if the host in the URL actually changed
    hostCached: null,

    // true if the server dropdown is open
    serverDropdownOpen: false,

    // array of channel objects (null if not yet fetched)
    channels: null,
  }

  reset() // setup initial state

  // reset component
  emitter.on('sidebar.reset', () => {
    reset()
    emitter.emit('render')
  })

  /*** server related ***/

  // switch to a server
  emitter.on('sidebar.switchserver', host => {
    emitter.emit('pushState', `/servers/${host}`)
  })

  // add a server to the server host list and switch to it
  emitter.on('sidebar.addserver', () => {
    const modal = new Modal({
      title: 'Add server',

      inputs: {
        // e.g. "localhost:3000"
        host: { label: 'Host' },
      },

      button: 'Add',
    })

    modal.on('submit', async ({ host }) => {
      modal.disable()

      // check host is a decent server
      try {
        const { decentVersion } = await fetch(`//${host}/api/`)
          .then(res => res.json())

        if (!decentVersion) {
          throw new Error('not a decent server')
        }

        // it's a decent server!
        modal.close()

        if (!state.sidebar.servers.includes(host)) {
          // add the server
          state.sidebar.servers.push(host)
          storage.set('servers', state.sidebar.servers)
        }

        // switch to it
        emitter.emit('sidebar.switchserver', host)
      } catch (error) {
        if (/(not a valid URL|NetworkError|JSON)/i.test(error.message)) {
          modal.showError('Failed to connect (not a Decent server?)')
        } else if (error.message === 'not a decent server') {
          modal.showError('Not a Decent server')
        } else {
          console.error(error)
          modal.showError('Internal error')
        }

        modal.disable(false)
        modal.focus()
      }
    })
  })

  // toggle the server dropdown
  emitter.on('sidebar.toggleserverdropdown', force => {
    state.sidebar.serverDropdownOpen = typeof force === 'undefined' ? !state.sidebar.serverDropdownOpen : force
    emitter.emit('render')

    // close when you click anywhere else
    if (state.sidebar.serverDropdownOpen === true) {
      const close = () => {
        emitter.emit('sidebar.toggleserverdropdown', false)
        document.body.removeEventListener('click', close)
      }

      document.body.addEventListener('click', close)
    }
  })

  // * make sure the host in the url is actually present in
  //   our server list; if not, add it
  // * load sessionID from storage for this server if possible
  // * fetch channel list
  emitter.on('routeready', async () => {
    if (state.params.host !== state.sidebar.hostCached && state.params.host) {
      state.sidebar.hostCached = state.params.host

      if (!state.sidebar.servers.includes(state.params.host)) {
        state.sidebar.servers.push(state.params.host)
        storage.set('servers', state.sidebar.servers)
      }

      state.sidebar.channels = null
      state.secure = false

      const sessionID = storage.get('sessionID@' + state.params.host)
      if (sessionID) {
        // fetch user data using this sessionID
        try {
          emitter.emit('render') // render no channels
          loadSessionID(sessionID)
        } catch (error) {
          state.session = null
          console.warn(error)
        }
      } else {
        state.session = null
      }

      emitter.emit('sidebar.fetchchannels')
    } else if (!state.params.host) {
      state.sidebar.channels = null
    } else if (state.query && state.query.c) {
      const channel = state.sidebar.channels.find(c => c.name === state.query.c)

      emitter.emit('replaceState', `/servers/${state.params.host}/channels/${channel.id}`)
    }

    emitter.emit('render')
  })

  /*** channel related ***/

  // fetch the channel list from the server
  emitter.on('sidebar.fetchchannels', async () => {
    if (state.sessionAuthorized) {
      const { channels } = await api.get(state, 'channels')
      state.sidebar.channels = channels
    } else {
      state.sidebar.channels = []
    }

    emitter.emit('render')

    // if ?c is present, go to that channel by name
    if (state.query && state.query.c) {
      const channel = channels.find(c => c.name === state.query.c)
      emitter.emit('replaceState', `/servers/${state.params.host}/channels/${channel.id}`)
    }
  })

  // create a channel
  emitter.on('sidebar.createchannel', () => {
    const modal = new Modal({
      title: 'Create channel',

      inputs: {
        channelName: { label: 'Channel name' },
      },

      button: 'Create',
    })

    modal.on('submit', async ({ channelName }) => {
      modal.disable()

      try {
        await api.post(state, 'channels', {
          name: channelName.trim(),
        })

        modal.close()
      } catch (error) {
        modal.showError(error.message)
        console.error(error)

        modal.disable(false) // enable
      }
    })
  })

  // switch to a channel
  emitter.on('sidebar.switchchannel', id => {
    // Don't switch to the channel if we're already viewing it!
    if (!(state.route === '/servers/:host/channels/:channel' && state.params.channel === id)) {
      emitter.emit('pushState', `/servers/${state.params.host}/channels/${id}`)

      // Mark the channel as read locally
      const channel = state.sidebar.channels.find(channel => channel.id === id)
      channel.unreadMessageCount = 0
    }
  })

  // move up/down the channel list
  emitter.on('sidebar.upchannel', () => {
    let index = state.sidebar.channels.findIndex(c => c.id === state.params.channel)
    if (index === 0) {
      index = state.sidebar.channels.length - 1
    } else {
      index--
    }
    emitter.emit('sidebar.switchchannel', state.sidebar.channels[index].id)
  })

  emitter.on('sidebar.downchannel', () => {
    let index = state.sidebar.channels.findIndex(c => c.id === state.params.channel)
    if (index === state.sidebar.channels.length - 1) {
      index = 0
    } else {
      index++
    }
    emitter.emit('sidebar.switchchannel', state.sidebar.channels[index].id)
  })

  // event: channel added
  emitter.on('ws.channel/new', ({ channel }) => {
    state.sidebar.channels.push(channel)
    emitter.emit('render')
  })

  // event: channel renamed
  emitter.on('ws.channel/rename', ({ channelID, newName }) => {
    const channel = state.sidebar.channels.find(c => channelID === c.id)
    channel.name = newName

    emitter.emit('render')
  })

  // event: channel deleted
  emitter.on('ws.channel/delete', ({ channelID }) => {
    state.sidebar.channels = state.sidebar.channels.filter(c => channelID !== c.id)

    if (state.params.channel === channelID) {
      // changing the state will re-render, so no need to also emit render
      emitter.emit('pushState', `/servers/${state.params.host}`)
    } else {
      emitter.emit('render')
    }
  })

  emitter.on('ws.message/new', ({ message }) => {
    const channel = state.sidebar.channels.find(channel => channel.id === message.channelID)

    if (channel.id !== state.params.channel) {
      channel.unreadMessageCount++
      emitter.emit('render')
    }
  })

  /** session related ***/

  // register
  emitter.on('sidebar.register', async () => {
    const modal = new Modal({
      title: 'Register',
      subtitle: 'on ' + state.params.host,

      inputs: {
        username: {
          label: 'Username',
        },

        password: {
          type: 'password',
          label: 'Password',
        },
      },

      button: 'Register',
    })

    modal.on('submit', async ({ username, password }) => {
      modal.disable()

      try {
        await api.post(state, 'users', { username, password })
        modal.close()
      } catch (error) {
        if (error.code === 'INVALID_NAME') {
          modal.showError('Username can contain only alphanumeric characters, underscores, and dashes')
        } else {
          modal.showError(error.message)
        }

        modal.disable(false) // enable
        return
      }

      await login(username, password)
    })
  })

  // login
  emitter.on('sidebar.login', async () => {
    const modal = new Modal({
      title: 'Login',
      subtitle: 'to ' + state.params.host,

      inputs: {
        username: {
          label: 'Username',
        },

        password: {
          type: 'password',
          label: 'Password',
        },
      },

      button: 'Login',
    })

    modal.on('submit', async ({ username, password }) => {
      try {
        await login(username, password)
        modal.close()
      } catch (error) {
        if (error.code === 'NOT_FOUND') {
          modal.showError('There is no user with that username.')
        } else {
          modal.showError(error.message)
        }
      }
    })
  })

  async function login(username, password) {
    const { sessionID } = await api.post(state, 'sessions', { username, password })
    await loadSessionID(sessionID)
    storage.set('sessionID@' + state.params.host, sessionID)
    emitter.emit('render')
  }

  // logout
  emitter.on('sidebar.logout', async () => {
    if (state.session.id) {
      try {
        await api.delete(state, 'sessions/' + state.session.id)
      } catch (error) {
        // It's okay to log out from a session which does not exist (e.g.
        // if sidebar.logout is emitted immediately after deleting the current
        // session from some other code).
        if (error.code !== 'NOT_FOUND') {
          throw error
        }
      }
    }

    state.session = null
    state.sessionAuthorized = null
    storage.set('sessionID@' + state.params.host, null)
    emitter.emit('logout')

    // Logging out from the account settings page should quit back to the
    // server homepage, since it doesn't make sense to try to change account
    // settings while not logged in.
    if (state.route === '/servers/:host/account') {
      emitter.emit('pushState', `/servers/${state.params.host}`)
    } else {
      emitter.emit('render')
    }
  })

  // fetch channels after logging in/out
  emitter.on('login', () => emitter.emit('sidebar.fetchchannels'))
  emitter.on('logout', () => emitter.emit('sidebar.fetchchannels'))

  async function loadSessionID(sessionID) {
    const { user } = await api.get(state, 'sessions/' + sessionID)
    if (user) {
      state.session = { id: sessionID, user }
      state.sessionAuthorized = user.authorized
      emitter.emit('login')
    } else {
      state.session = null
      state.sessionAuthorized = null
      emitter.emit('logout')
    }
  }
}

const component = (state, emit) => {
  return html`<aside class='Sidebar --on-left'>
    <section class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Servers</h4>
        <button class=${state.sidebar.servers.length === 0 ? 'wiggle' : ''} onclick=${() => emit('sidebar.addserver')}>+ Add</button>
      </div>

      ${state.sidebar.servers.length ? html`<div
        class='ServerDropdown ${state.sidebar.serverDropdownOpen ? 'is-open' : (state.params.host ? '' : 'wiggle')}'
        onclick=${e => { emit('sidebar.toggleserverdropdown'); e.stopPropagation() } }>
          <div>${state.params.host || 'Select a server...'}</div>
          <div class='ServerDropdown-panel'>
            ${state.sidebar.servers.map(host => html`<div
              class='ServerDropdown-option ${host === state.params.host ? 'is-active' : ''}'
              onclick=${() => emit('sidebar.switchserver', host)}>
                ${host}
            </div>`)}
          </div>
        </div>
      ` : html`<span></span>`}

      ${state.params.host ? (() => {
        if (state.session.user) {
          return html`<div class='SessionInfo'>
            <div class='SessionInfo-text'>
              Logged in as
              <a class='SessionInfo-username Link' onclick=${() => emit('pushState', `/servers/${state.params.host}/account`)}>${state.session.user.username}</a>
            </div>

            <button class='SessionInfo-button' onclick=${() => emit('sidebar.logout')}>Logout</button>
          </div>`
        } else {
          return html`<div class='SessionInfo'>
            <div class='SessionInfo-text'>Logged out</div>

            <button class='SessionInfo-button' onclick=${() => emit('sidebar.register')}>Register</button>
            <button class='SessionInfo-button --minor' onclick=${() => emit('sidebar.login')}>Login</button>
          </div>`
        }
      })() : html`<span></span>`}
    </section>

    ${// isAuthorized will be set to false *only* when logged in but NOT
      // authorized. Otherwise, it'll be set to null.
      state.sessionAuthorized !== false &&
        state.sidebar.channels !== null &&
        (!state.serverRequiresAuthorization || state.sessionAuthorized) ? html`<section class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Channels</h4>
        ${state.session.user && state.session.user.permissionLevel === 'admin'
          ? html`<button onclick=${() => emit('sidebar.createchannel')}>+ Create</button>`
          : html`<span></span>`}
      </div>

      <div class='Sidebar-list'>
        ${state.sidebar.channels.map(channel => {
          const classList = [ 'Sidebar-list-item', '--icon-channel' ]

          if (channel.id === state.params.channel) classList.push('is-active')
          if (channel.unreadMessageCount) classList.push('is-unread')

          return html`<a class=${classList.join(' ')} onclick=${() => emit('sidebar.switchchannel', channel.id)}>
            ${channel.name}
          </a>`
        })}
      </div>
    </section>` : html`<span></span>`}

    ${state.sessionAuthorized === false ? html`<section class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Unauthorized</h4>
      </div>
      <div class='Sidebar-section-content'>
        <p>${raw(mrk(state)(state.authorizationMessage).html())}</p>
      </div>
    </section>` : html`<span></span>`}

    ${state.session.user && state.session.user.permissionLevel === 'admin' ? html`<section class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Server settings</h4>
      </div>

      <div class='Sidebar-list'>
        ${[
          'Emotes',
          state.serverRequiresAuthorization ? 'Authorized Users' : null
        ].filter(Boolean).map(name => {
          const id = {
            'Emotes': 'emotes',
            'Authorized Users': 'authorizedUsers'
          }[name]

          return html`<a
            class='Sidebar-list-item --icon-setting ${(state.params.setting || null) === id ? 'is-active' : ''}'
            onclick=${() => emit('pushState', `/servers/${state.params.host}/settings/${id}`)}>

            ${name}
          </a>`
        })}
      </div>
    </section>` : html`<span></span>`}

    <section class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Preferences</h4>
      </div>

      <div class='Sidebar-list'>
        ${[
          'Appearance',
        ].filter(Boolean).map(name => {
          const id = {
            'Appearance': 'appearance',
          }[name]

          return html`<a
            class='Sidebar-list-item --icon-setting ${(state.params.pref || null) === id ? 'is-active' : ''}'
            onclick=${() => emit('pushState', `/servers/${state.params.host}/prefs/${id}`)}>

            ${name}
          </a>`
        })}
      </div>
    </section>
  </aside>`
}

module.exports = { store, component }
