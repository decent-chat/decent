const { h, Component } = require('preact')

class ServerList extends Component {
  state = {
    dropdownIsOpen: false,
  }

  render({ servers, activeServerName, onJoinClick, switchToHost }) {
    const { dropdownIsOpen } = this.state

    return <div class='Sidebar-section --bottom-line'>
      <div class='Sidebar-section-title'>
        <h4>Server</h4>
        <button onClick={onJoinClick}>+ Join</button>
      </div>

      <div class={dropdownIsOpen ? 'ServerDropdown is-open' : 'ServerDropdown'} onClick={this.showDropdown.bind(this)}>
        <div>{activeServerName}</div>
        <div class='ServerDropdown-panel'>
          {servers.map(({ hostname, name, isActive, index }) => {
            return <div
              class={isActive ? 'ServerDropdown-option is-active' : 'ServerDropdown-option'}
              onClick={evt => this.onDropdownSelect(index, switchToHost, evt)}
            >
              {name}
            </div>
          })}
        </div>
      </div>
    </div>
  }

  showDropdown() {
    this.setState({dropdownIsOpen: true})
  }

  onDropdownSelect(index, f, evt) {
    evt.stopPropagation() // Don't trigger showDropdown() also
    this.setState({dropdownIsOpen: false})
    f(index)
  }
}

module.exports = ServerList
