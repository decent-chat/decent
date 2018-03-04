const { h, Component } = require('preact')

class ServerList extends Component {
  constructor() {
    super()

    this.state = {
      dropdownIsOpen: false,
    }

    this.toggleDropdown = this.toggleDropdown.bind(this)
  }

  componentDidMount() {
    const { pool } = this.context

    this.setState({me: pool.activeServer.client.me})

    // TODO: Need client + pool event for when current user changes
  }

  render({ servers, activeServerName, onJoinClick, switchToServer }, { me }) {
    const { dropdownIsOpen } = this.state

    return <div class='Sidebar-section --bottom-line'>
      <div class='Sidebar-section-title'>
        <h4>Server</h4>
        <button onClick={onJoinClick}>+ Join</button>
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

      { me &&
        <div class='SessionInfo'>
          <div class='SessionInfo-text'>
            Logged in as<a class='SessionInfo-username Link'>{me.username}</a>
          </div>
          <button class='SessionInfo-button'>Logout</button>
        </div>
      }
      { !me &&
        <div class='SessionInfo'>
          <div class='SessionInfo-text'>
            Logged out
          </div>
          <button class='SessionInfo-button'>Register</button>
          <button class='SessionInfo-button --minor'>Login</button>
        </div>
      }
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
