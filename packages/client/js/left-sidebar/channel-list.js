const { h, Component } = require('preact')

class ChannelList extends Component {
  state = {
    channels: [],
    activeChannelIndex: -1,
  }

  componentDidMount() {
    const { pool } = this.context

    this.setState({
      channels: pool.activeServer.client.channels,
      activeChannelIndex: pool.activeServer.ui.activeChannelIndex,
    })

    pool.activeChannels.on('change', channels => {
      this.setState({channels})
    })
  }

  render(_, { channels, activeChannelIndex }) {
    return <div class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Channels</h4>
        <button>+ Create</button>
      </div>

      <div class='Sidebar-list'>
        {channels.map((channel, index) => {
          let className = 'Sidebar-list-item --icon-channel'
          if (index === activeChannelIndex) className += ' is-active'

          return <a
            class={className}
            onClick={() => {
              this.context.pool.activeServer.ui.activeChannelIndex = index
              this.setState({ activeChannelIndex: index })
            }}
          >
            {channel.name}
          </a>
        })}
      </div>
    </div>
  }
}

module.exports = ChannelList
