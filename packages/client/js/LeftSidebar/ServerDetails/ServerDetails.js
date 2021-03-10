const { h, Component } = require('preact')
const Modal = require('/Modal')
const Dropdown = require('/Dropdown')

class ServerDetails extends Component {
  state = {dropdownVisible: false}

  toggleDropdown = evt => {
    if (evt) {
      this.setState({dropX: evt.clientX, dropY: evt.clientY})
    }

    this.setState({dropdownVisible: !this.state.dropdownVisible})
  }

  render({ onAddServer, toggleServerList },
         { dropdownVisible, dropX, dropY }) {
    const { client, ui } = this.context.pool.activeServer
    const activeServerName = client.serverName

    const servers = this.context.pool.servers.map(({ hostname, client: clientN }, index) => {
      return {
        hostname,
        name: clientN.serverName,
        isActive: client === clientN,
        index,
      }
    })

    return <div class='Sidebar-section --no-pad'>
      <div class='ServerDetails' onClick={this.toggleDropdown}>
        <div class='ServerDetails-activeName'>{activeServerName}</div>
      </div>

      {dropdownVisible && <Dropdown x={dropX} y={dropY} onClose={this.toggleDropdown}>
        <div class='Dropdown-header'>
          <b>Switch server</b>
        </div>

        {servers.filter(s => !s.isActive).map(({ name, hostname, index }) => {
          return <div class='Dropdown-listItem' onClick={() => {
            this.context.pool.setActive(index)
            this.setState({dropdownVisible: false})
          }}>
            {name}
            <div class='Dropdown-muted'>{hostname}</div>
          </div>
        })}

        {servers.length === 1 && servers[0].isActive &&
          <div class='Dropdown-text'>This is the only saved server available!</div>
        }

        <div class='Dropdown-separator'></div>

        <div class='Dropdown-listItem' onClick={() => {
          onAddServer()
          this.setState({dropdownVisible: false})
        }}>
          Connect to a server...
        </div>

        <div class='Dropdown-listItem' onClick={() => {
          toggleServerList()
          this.setState({dropdownVisible: false})
        }}>
          Toggle server quick-switcher
        </div>

        <div class='Dropdown-listItem' onClick={() => {
          this.setState({dropdownVisible: false})
          this.context.pool.remove(this.context.pool.activeIndex)
        }}>
          Forget <b>{client.serverName}</b>
        </div>
      </Dropdown>}
    </div>
  }
}

module.exports = ServerDetails
