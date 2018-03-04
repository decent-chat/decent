const { h, Component } = require('preact')

class ServerList extends Component {
  constructor() {
    super()

    this.state = {
      dropdownIsOpen: false,
    }

    this.toggleDropdown = this.toggleDropdown.bind(this)
  }

  render({ servers, activeServerName, onJoinClick, switchToServer }) {
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
              onClick={evt => this.onDropdownSelect(index, switchToServer, evt)}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  }

  toggleDropdown() {
    this.setState({dropdownIsOpen: !this.state.dropdownIsOpen})
  }

  onDropdownSelect(index, f, evt) {
    evt.stopPropagation() // Don't trigger toggleDropdown() also
    this.setState({dropdownIsOpen: false})
    f(index)
  }
}

module.exports = ServerList
