// sidebar component
const html = require('choo/html')
const css = require('sheetify')
const { Modal, api, storage } = require('../util')

const prefix = css('./sidebar.css')

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
        const { decent } = await fetch(`//${host}/api/`)
          .then(res => res.json())

        if (!decent) {
          throw 'not a decent server'
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
  emitter.on('route', async () => {
    if (state.params.host !== state.sidebar.hostCached && state.params.host) {
      state.sidebar.hostCached = state.params.host

      if (!state.sidebar.servers.includes(state.params.host)) {
        state.sidebar.servers.push(state.params.host)
        storage.set('servers', state.sidebar.servers)
      }

      state.sidebar.channels = null

      const sessionID = storage.get('sessionID@' + state.params.host)
      if (sessionID) {
        // fetch user data using this sessionID
        try {
          emitter.emit('render') // render no channels
          const { user } = await api.get(state.params.host, 'session/' + sessionID)

          state.session = { id: sessionID, user }
          emitter.emit('login')
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
    }

    emitter.emit('render')
  })

  /*** channel related ***/

  // fetch the channel list from the server
  emitter.on('sidebar.fetchchannels', async () => {
    const data = state.session ? { sessionID: state.session.id } : {}
    const { channels } = await api.get(state.params.host, 'channel-list', data)

    state.sidebar.channels = channels
    emitter.emit('render')
  })

  // create a channel & switch to it
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
        const { success } = await api.post(state.params.host, 'create-channel', {
          name: channelName.trim(),
          sessionID: state.session.id,
        })

        modal.close()
        emitter.emit('sidebar.switchchannel', channelName.trim())
      } catch (error) {
        if (error.message === 'name invalid') {
          modal.showError('Invalid name - can only contain a-z, 0-9,\nunderscores, and dashes')
        } else if (error.message === 'channel name already taken') {
          modal.showError(`#${channelName.trim()} already exists`)
        } else {
          console.error(error)
          modal.showError('Internal error')
        }

        modal.disable(false) // enable
      }
    })
  })

  // switch to a channel
  emitter.on('sidebar.switchchannel', id => {
    emitter.emit('pushState', `/servers/${state.params.host}/channels/${id}`)
  })

  // event: channel added
  emitter.on('ws.creatednewchannel', ({ channel }) => {
    state.sidebar.channels.push(channel)
    emitter.emit('render')
  })

  // event: channel renamed
  emitter.on('ws.renamedchannel', ({ channelID, newName }) => {
    const channel = state.sidebar.channels.find(c => channelID === c.id)
    channel.name = newName

    emitter.emit('render')
  })

  // event: channel deleted
  emitter.on('ws.deletedchannel', ({ channelID }) => {
    state.sidebar.channels = state.sidebar.channels.filter(c => channelID !== id)
    emitter.emit('render')
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
        await api.post(state.params.host, 'register', { username, password })

        // close the modal
        modal.close()
      } catch (error) {
        // handle error
        if (error.message === 'username already taken') {
          modal.showError('Username already taken')
        } else if (error.message === 'password must be at least 6 characters long') {
          modal.showError('Password must be at least 6 characters long')
        } else if (error.message === 'username invalid') {
          modal.showError('Username can contain only alphanumeric characters, underscores, and dashes')
        } else {
          // not an error from the server?
          console.error(error)
          modal.showError('Internal error')
        }

        modal.disable(false) // enable
      }
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
        const { sessionID } = await api.post(state.params.host, 'login', { username, password })
        const { user } = await api.get(state.params.host, 'session/' + sessionID)

        state.session = { id: sessionID, user }
        storage.set('sessionID@' + state.params.host, sessionID)
        emitter.emit('login')
        emitter.emit('render')

        // close the modal
        modal.close()
      } catch (error) {
        // handle error
        if (error.message === 'incorrect password') {
          modal.showError('Incorrect password')
        } else if (error.message === 'user not found') {
          modal.showError('User not found')
        } else {
          // not an error from the server?
          console.error(error)
          modal.showError('Internal error')
        }
      }
    })
  })

  // logout
  emitter.on('sidebar.logout', () => {
    state.session = null
    storage.set('sessionID@' + state.params.host, null)
    emitter.emit('render')
  })
}

const component = (state, emit) => {
  return html`<aside class=${prefix}>
    <section class='server'>
      <div class='subtitle'>
        <h4>Servers</h4>
        <button class=${state.sidebar.servers.length === 0 ? 'wiggle' : ''} onclick=${() => emit('sidebar.addserver')}>+ Add</button>
      </div>

      ${state.sidebar.servers.length ? html`<div
        class='server-dropdown ${state.sidebar.serverDropdownOpen ? 'open' : (state.params.host ? '' : 'wiggle')}'
        onclick=${e => { emit('sidebar.toggleserverdropdown'); e.stopPropagation() } }>
          <div>${state.params.host || 'Select a server...'}</div>
          <div class='panel'>
            ${state.sidebar.servers.map(host => html`<div
              class='option ${host === state.params.host ? 'active' : ''}'
              onclick=${() => emit('sidebar.switchserver', host)}>
                ${host}
            </div>`)}
          </div>
        </div>
      ` : html`<span></span>`}

      ${state.params.host ? (() => {
        if (state.session) {
          return html`<div class='session'>
            <div class='text'>Logged in as <a class='username'>${state.session.user.username}</a></div>

            <button onclick=${() => emit('sidebar.logout')}>Logout</button>
          </div>`
        } else {
          return html`<div class='session'>
            <div class='text'>Logged out</div>

            <button onclick=${() => emit('sidebar.register')}>Register</button>
            <button class='minor' onclick=${() => emit('sidebar.login')}>Login</button>
          </div>`
        }
      })() : html`<span></span>`}
    </section>

    ${state.sidebar.channels !== null ? html`<section>
      <div class='subtitle'>
        <h4>Channels</h4>
        ${state.session && state.session.user.permissionLevel === 'admin'
          ? html`<button onclick=${() => emit('sidebar.createchannel')}>+ Create</button>`
          : html`<span></span>`}
      </div>

      <div class='list'>
        ${state.sidebar.channels.map(channel => {
          const classList = [ 'item', 'channel' ]

          if (channel.id === state.params.channel) classList.push('active')
          if (channel.unreadMessageCount) classList.push('unread')

          return html`<a class=${classList.join(' ')} onclick=${() => emit('sidebar.switchchannel', channel.id)}>
            ${channel.name}
          </a>`
        })}
      </div>
    </section>
    ` : html`<span></span>`}
  </aside>`
}

module.exports = { store, component, prefix }
