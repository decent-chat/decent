const { h, Component } = require('preact')
const Modal = require('/Modal')
const Icon = require('/Icon')
const Dropdown = require('/Dropdown')

class ServerList extends Component {
  state = {popup: null}

  componentDidMount() {
    this.context.pool.on('connectionchange', () => this.forceUpdate())
  }

  render({ onAddServer }, { popup }) {
    const { servers, failedServers, activeIndex } = this.context.pool

    return <div class='ServerList'>
      {servers.map((server, index) => {
        const iconURL = server.client.serverIconURL
        const displayName = server.client.serverName

        const classList = ['ServerList-server']
        if (index === activeIndex) {
          classList.push('is-active')
        }

        return <div class={classList.join(' ')} title={displayName} onClick={this.context.pool.setActive.bind(this.context.pool, index)}>
          {iconURL ?
            <img class='ServerList-iconReal' src={server.client.serverIconURL}/>
          : <div class='ServerList-iconText'>
            {displayName.substr(0, 2)}
          </div>}
        </div>
      })}

      {failedServers.map(server => {
        return <div class='ServerList-server is-failed' title={server.hostname} onClick={evt => {
          this.setState({popup: {server, evt}})
        }}>
          <Icon class='ServerList-dcIcon' icon='disconnect'/>
        </div>
      })}

      {popup && <Dropdown x={popup.evt.clientX} y={popup.evt.clientY} onClose={() => this.setState({popup: null})}>
        <div class='Dropdown-header --red'>
          Disconnected!
        </div>

        <div class='Dropdown-text'>
          Failed to connect to <b>{popup.server.hostname}</b>.
        </div>

        <div class='Dropdown-separator'></div>

        <div class='Dropdown-listItem' onClick={() => {
          this.setState({popup: null})
          this.context.pool.tryReconnect()
        }}>
          Try again
        </div>

        <div class='Dropdown-listItem' onClick={() => {
          this.setState({popup: null})
          this.context.pool.removeFailedHost(popup.server.hostname)
        }}>
          Leave this server
        </div>
      </Dropdown>}

      <div class='ServerList-addNew' onClick={onAddServer}>
        Add...
      </div>
    </div>
  }
}

module.exports = ServerList
