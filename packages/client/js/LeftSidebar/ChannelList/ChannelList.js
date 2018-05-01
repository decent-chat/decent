const { h, Component } = require('preact')
const Modal = require('/Modal')

class ChannelList extends Component {
  state = {
    channels: [],
    activeChannelIndex: -1,
    canCreateChannel: false,
    showCreateChannelModal: false,
  }

  componentDidMount() {
    const { pool } = this.context

    this.setState({
      channels: pool.activeServer.client.channels,
      activeChannelIndex: pool.activeServer.ui.activeChannelIndex.get(),
    })

    pool.activeChannelsEE.on('change', channels => {
      this.setState({channels})
    })

    const checkPermissions = k => async () => {
      if (k) pool.activeServer.client.me.on('change', checkPermissions(false))

      const { manageChannels } = await pool.activeServer.client.me.getPermissions()

      this.setState({canCreateChannel: manageChannels})
    }

    pool.activeClientEE.on('login', checkPermissions(true))
    if (pool.activeServer.client.me) checkPermissions(true)()

    pool.activeClientEE.on('logout', () => {
      this.setState({canCreateChannel: false})
    })
  }

  render(_, { channels, activeChannelIndex, canCreateChannel, showCreateChannelModal }) {
    return <div class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Channels</h4>
        {canCreateChannel && <button onClick={() => this.setState({showCreateChannelModal: true})}>+ Create</button>}
      </div>

      {showCreateChannelModal && <Modal.Async
        title='Create a channel'
        submit={({ name }) => {
          return this.context.pool.activeServer.client.channels.create(name)
        }}
        onHide={() => this.setState({showCreateChannelModal: false})}
      >
        <Modal.Input name='name' label='Channel name'/>

        <Modal.Button action='submit'>Create</Modal.Button>
      </Modal.Async>}

      <div class='Sidebar-list'>
        {channels.map((channel, index) => {
          let className = 'Sidebar-list-item --icon-channel'
          if (index === activeChannelIndex) className += ' is-active'

          return <a
            class={className}
            onClick={() => {
              this.context.pool.activeServer.ui.activeChannelIndex.set(index)
              this.setState({activeChannelIndex: index})
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
