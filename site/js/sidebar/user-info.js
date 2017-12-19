const html = require('choo/html')
const history = require('../util/history')
const Modal = require('../util/modal')
const { get, post } = require('../util/api')

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

  async function register() {
    const modal = new Modal({
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
    })

    modal.on('submit', async ({ username, password }) => {
      modal.disable()

      try {
        const { sessionID, user } = await post(host, 'register', { username, password })

        // globally broadcast this state change
        history.emit('session id update', sessionID)
        history.emit('session update', user)

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
  }

  async function login() {
    const modal = new Modal({
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
    })

    modal.on('submit', async ({ username, password }) => {
      try {
        const { sessionID } = await post(host, 'login', { username, password })
        const { user } = await get(host, 'session/' + sessionID)

        // globally broadcast this state change
        history.emit('session id update', sessionID)
        history.emit('session update', user)

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
  }

  async function logout() {
    history.emit('session id update', null)
    history.emit('session update', null)
  }
}

module.exports = userInfo
