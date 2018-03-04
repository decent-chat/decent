const { h, Component } = require('preact')
const Modal = require('../modal')

class ServerList extends Component {
  constructor() {
    super()

    this.state = {
      me: null,
      dropdownIsOpen: false,
      showRegisterModal: false,
      showLoginModal: false,
    }

    this.toggleDropdown = this.toggleDropdown.bind(this)
  }

  componentDidMount() {
    const { pool } = this.context

    const onLogin = () => {
      const { me } = pool.activeServer.client

      this.setState({me})

      me.on('change', () => {
        // this.state.me may update automatically but we need to rerender
        this.forceUpdate()
      })
    }

    pool.activeClientEE.on('login', onLogin)
    if (pool.activeServer.client.me) onLogin()

    pool.activeClientEE.on('logout', () => {
      this.setState({me: null})
    })
  }

  render({ servers, activeServerName, onJoinClick, switchToServer },
         { me, showRegisterModal, showLoginModal, dropdownIsOpen }) {
    const { client } = this.context.pool.activeServer

    return <div class='Sidebar-section --bottom-line'>
      <div class='Sidebar-section-title'>
        <h4>Server</h4>
        <button onClick={() => onJoinClick()}>+ Join</button>
      </div>

      <div class={dropdownIsOpen ? 'ServerDropdown is-open' : 'ServerDropdown'} onClick={this.toggleDropdown}>
        <div>{activeServerName}</div>
        <div class='ServerDropdown-panel'>
          {servers.map(({ hostname, name, isActive, index }) => (
            <div
              class={isActive ? 'ServerDropdown-option is-active' : 'ServerDropdown-option'}
              title={hostname}
              onClick={evt => this.onDropdownSelect(index, evt)}
            >
              {name}
            </div>
          ))}
        </div>
      </div>

      {me && <div class='SessionInfo'>
        <div class='SessionInfo-text'>
          Logged in as<a class='SessionInfo-username Link'>{me.username}</a>
        </div>
        <button class='SessionInfo-button' onClick={() => client.logout()}>Logout</button>
      </div>}

      {!me && <div class='SessionInfo'>
        <div class='SessionInfo-text'>
          Logged out
        </div>

        <button
          class='SessionInfo-button'
          onClick={() => this.setState({showRegisterModal: true})}
        >
          Register
        </button>

        <button
          class='SessionInfo-button --minor'
          onClick={() => this.setState({showLoginModal: true})}
        >
          Login
        </button>
      </div>}

      {showRegisterModal && <Modal.Async
        title='Register'
        subtitle={`on ${activeServerName}`}
        submit={async ({ username, password }) => {
          await client.register(username, password)
          await client.login(username, password)
        }}
        onHide={() => this.setState({showRegisterModal: false})}
      >
        <Modal.Input name='username' label='Username'/>
        <Modal.Input name='password' label='Password' type='password'/>

        <Modal.Button class='--no-bg' action='cancel'>Cancel</Modal.Button>
        <Modal.Button action='submit'>Register</Modal.Button>
      </Modal.Async>}

      {showLoginModal && <Modal.Async
        title='Login'
        subtitle={`to ${activeServerName}`}
        submit={async ({ username, password }) => {
          await client.login(username, password)
        }}
        onHide={() => this.setState({showLoginModal: false})}
      >
        <Modal.Input name='username' label='Username'/>
        <Modal.Input name='password' label='Password' type='password'/>

        <Modal.Button class='--no-bg' action='cancel'>Cancel</Modal.Button>
        <Modal.Button action='submit'>Login</Modal.Button>
      </Modal.Async>}
    </div>
  }

  toggleDropdown() {
    this.setState({dropdownIsOpen: !this.state.dropdownIsOpen})
  }

  onDropdownSelect(index, evt) {
    evt.stopPropagation() // Don't trigger toggleDropdown() also
    this.setState({dropdownIsOpen: false})
    this.context.pool.setActive(index)
  }
}

module.exports = ServerList
