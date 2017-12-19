const html = require('choo/html')
const history = require('../util/history')
const { prompt } = require('../util/modal')
const { get, post } = require('../util/api')

// template for a single server dropdown option
// intended to be called and then used in Array#map
const dropdownOption = emit => (server, index) => {
  return html`<div class='server-dropdown-option ${server.active ? 'active' : ''}' onclick=${switchToMe}>
    ${server.host}
  </div>`

  // switches to `server`
  function switchToMe() {
    emit('switch server', index)

    // server dropdown will be closed as a result of this click event bubbling
  }
}

// template for user info of current server
const userInfo = (state, emit) => {
  const { host } = state.servers[state.activeServer]

  if (state.loggedIn) {
    return html`<div class='user-info'>
      <div class='user-info-text'>Logged in as <a class='user-info-name'>${state.user.username}</a></div>

      <button class='user-info-button' onclick=${logout}>Logout</button>
    </div>`
  } else {
    return html`<div class='user-info'>
      <div class='user-info-text'>Logged out</div>

      <div class='user-info-button' onclick=${register}>Register</button>
      <div class='user-info-button user-info-button-minor' onclick=${login}>Login</button>
    </div>`
  }

  async function register(pastError) {
    const modal = await prompt({
      title: 'Register',
      subtitle: 'on ' + host,

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
      error: pastError, closeOnSubmit: false,
    }).catch(err => {
      if (err === 'modal closed') return null
      else throw err
    })

    if (!modal) {
      return
    }

    try {
      const { sessionID, user } = await post(host, 'register', modal.data)

      // globally broadcast this state change
      history.emit('session id update', sessionID)
      history.emit('session update', user)

      // close the modal
      modal.close()
    } catch (error) {
      modal.close()

      // handle error
      if (error.message === 'username already taken') {
        register('Username already taken')
      } else if (error.message === 'password must be at least 6 characters long') {
        register('Password must be at least 6 characters long')
      } else if (error.message === 'username invalid') {
        register('Username can contain only alphanumeric characters, underscores, and dashes')
      } else {
        // not an error from the server?
        console.error(error)
        register('Internal error')
      }
    }
  }

  async function login(pastError) {
    const modal = await prompt({
      title: 'Login',
      subtitle: 'to ' + host,

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
      error: pastError, closeOnSubmit: false,
    }).catch(err => {
      if (err === 'modal closed') return null
      else throw err
    })

    if (!modal) {
      return
    }

    try {
      const { sessionID } = await post(host, 'login', modal.data)
      const { user } = await get(host, 'session/' + sessionID)

      // globally broadcast this state change
      history.emit('session id update', sessionID)
      history.emit('session update', user)

      // close the modal
      modal.close()
    } catch (error) {
      modal.close()

      // handle error
      if (error.message === 'incorrect password') {
        login('Incorrect password')
      } else if (error.message === 'user not found') {
        login('User not found')
      } else {
        // not an error from the server?
        console.error(error)
        login('Internal error')
      }
    }
  }

  async function logout() {
    history.emit('session id update', null)
    history.emit('session update', null)
  }
}

// template for the 'server' section of the sidebar
module.exports = (state, emit) => {
  const server = state.servers[state.activeServer]
  const dropdownOpen = state.serverDropdownOpen

  return html`<div class='sidebar-section sidebar-section-server'>
    <div class='sidebar-subtitle'>
      <h4>Server</h4>
      <div class='sidebar-subtitle-button' onclick=${addServer}>+ Add</div>
    </div>

    <div class='server-dropdown ${dropdownOpen ? 'open' : ''}' onclick=${toggleDropdown}>
      <div class='server-dropdown-current'>${server.host}</div>
      <div class='server-dropdown-panel'>
        ${state.servers.map(dropdownOption(emit))}
      </div>
    </div>

    ${userInfo(state, emit)}
  </div>`

  // adds a server URL
  async function addServer() {
    const { host } = await prompt({
      title: 'Add server',

      inputs: {
        // e.g. "localhost:3000"
        host: {
          label: 'Host',
        },
      },

      button: 'Add',
    }).catch(err => {
      if (err === 'modal closed') return {}
      else throw err
    })

    if (!host || host.trim().length === 0) {
      return
    }

    emit('add server', host)
  }

  // toggles the server dropdown
  function toggleDropdown() {
    emit('toggle server dropdown')
  }
}
