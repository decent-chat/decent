const { h, Component } = require('preact')
const Modal = require('/Modal')

class ServerList extends Component {
  render({ onAddServer }) {
    const { servers, activeIndex } = this.context.pool

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

      <div class='ServerList-addNew' onClick={onAddServer}>
        Add...
      </div>
    </div>
  }
}

module.exports = ServerList
