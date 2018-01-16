const html = require('bel')
const css = require('sheetify')
const { Modal, storage, api } = require('../../util')

const Nanocomponent = require('nanocomponent')
const Machine = require('nanostate')
const nonew = require('no-new')

// note: emits a global event called 'updatesession'
class AuthState extends Nanocomponent {
  constructor (emitter) {
    super()
    this.emitter = emitter

    this.machine = Machine('unloaded', {
      unloaded: { fetch: 'fetching', reset: 'unloaded' },
      fetching: {
        login: 'loggedin',
        logout: 'loggedout',
        needsauth: 'needsauth'
      },

      loggedin: { fetch: 'fetching', reset: 'unloaded' },
      loggedout: { fetch: 'fetching', reset: 'unloaded' },
      needsauth: { login: 'loggedin', logout: 'loggedout' }
    })

    this.machine.on('login', () => this.emitter.emit('render'))
    this.machine.on('logout', () => this.emitter.emit('render'))
    this.machine.on('reset', () => this.emitter.emit('render'))

    this.emitter.on('switchhost', host => {
      if (host === null) {
        this.machine.emit('reset')
      } else {
        this.machine.emit('fetch')
      }
    })

    this.machine.on('fetch', async () => {
      const sessionID = storage.get('sessionid/' + api.host) || null

      if (!sessionID) {
        console.log('sidebar/auth-state: no session id found for host')

        api.clearSession()

        this.emitter.emit('updatesession', null)
        this.machine.emit('logout')

        return
      }

      this.emitter.emit('render')

      try {
        const { session } = await api.get('session/' + sessionID)

        api.setSession(session.id, session.user)

        this.emitter.emit('updatesession', session.id)
        this.machine.emit('login')
      } catch (error) {
        console.error('sidebar/auth-state: error fetching session', error)

        api.clearSession()

        this.emitter.emit('updatesession', null)
        this.machine.emit('logout')
      }
    })

    this._cache = {}
    this.update() // set cache
  }

  createElement () {
    css`
      #sidebar .auth-state {
        display: flex;
        align-items: center;
        padding: 0 16px;

        font-size: 14px;
        font-weight: normal;
        color: var(--gray-300);

        & > .text {
          margin-right: auto;
        }

        & > button {
          padding: 6px 8px;

          background: var(--blue-a2);
          color: var(--blue);

          cursor: pointer;
          font-size: 12px;

          border-radius: 4px;
          border: 0;

          &:hover {
            background: var(--blue-a3);
          }

          &.minor {
            margin-left: 8px;

            background: var(--gray-700);
            color: var(--gray-300);

            &:hover {
              background: var(--gray-700);
              color: var(--gray-100);
            }
          }
        }
      }
    `

    if (this.machine.state === 'unloaded') {
      return html`
        <section class='auth-state'>
          <!-- auth state -->
        </section>
      `
    }

    if (this.machine.state === 'fetching') {
      return html`
        <section class='auth-state loading'>
          <div class='text'>Logging in...</div>
        </section>
      `
    }

    if (this.machine.state === 'loggedin') {
      css`
        #sidebar .auth-state.logged-in {
          & .username {
            color: var(--blue);
            cursor: pointer;
            text-decoration: underline;
            font-weight: bold;

            margin-left: 5px;
          }
        }
      `

      return html`
        <section class='auth-state logged-in'>
          <div class='text'>
            Logged in as
            <a class='username' onclick=${() => this.openAccountSettings()}>${api.session.user.username}</a>
          </div>
        </section>
      `
    }

    if (this.machine.state === 'loggedout') {
      return html`
        <section class='auth-state logged-out'>
          <div class='text'>Logged out</div>

          <button onclick=${() => this.displayRegisterModal()}>Register</button>
          <button class='minor' onclick=${() => this.displayLoginModal()}>Login</button>
        </section>
      `
    }

    if (this.machine.state === 'needsauth') {
      css`
        #sidebar .auth-state.needs-auth {
          color: var(--blue);
          background: var(--gray-200);
        }
      `

      return html`
        <section class='auth-state needs-auth'>
          <span class='msg'>needs auth</span>
        </section>
      `
    }
  }

  update () {
    const shouldUpdate = this.machine.state !== this._cache.machineState

    this._cache = {
      machineState: this.machine.state
    }

    return shouldUpdate
  }

  // TODO
  openAccountSettings() {
    window.alert('Todo!')
  }

  displayRegisterModal() {
    const modal = new Modal({
      title: 'Register',
      subtitle: 'on ' + api.host,

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
        await api.post('register', { username, password })

        // close the modal
        modal.close()
      } catch (error) {
        // handle errors
        // TODO: handle different errors differently; see #182
        console.error(error)
        modal.showError(error.message)

        modal.disable(false) // enable
      }
    })
  }

  displayLoginModal() {
    const modal = new Modal({
      title: 'Login',
      subtitle: 'to ' + api.host,

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
        const { sessionID } = await api.post('login', { username, password })

        storage.set('sessionid/' + api.host, sessionID)
        this.machine.emit('fetch') // loads session data, sets api.session

        // close the modal
        modal.close()
      } catch (error) {
        // handle errors
        // TODO: handle different errors differently; see #182
        console.error(error)
        modal.showError(error.message)

        modal.disable(false) // enable
      }
    })
  }
}

module.exports = nonew(AuthState)
