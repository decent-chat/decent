const { h, render, Component } = require('preact')
const { default: Provider } = require('preact-context-provider')
const Pool = require('./ServerPool')
const Atom = require('./ServerPool/Atom')
const storage = require('./storage')

if (process.env !== 'production') {
  require('preact/debug')
}

const ServerList = require('./ServerList')
const LeftSidebar = require('./LeftSidebar')
const RightSidebar = require('./RightSidebar')
const Modal = require('./Modal')
const Icon = require('./Icon')
const Toast = require('./Toast')
const Messages = require('./Messages')

// TODO: make theming an actual option
const theme = require('./theme')
theme.apply(theme.light)

class App extends Component {
  state = {
    isLoading: true,
    disconnected: false,
    showJoinServerModal: false,
    serverListVisible: false,
  }

  pool = new Pool()

  async componentDidMount() {
    global.$app = this

    await this.pool.load()

    this.setState({
      isLoading: false,
      serverListVisible: storage.load('serverListVisible', false),
    })

    this.pool.onUIChange('activeChannelIndex', () => this.forceUpdate())
    this.pool.activeChannelsEE.on('change', () => this.updateDocumentTitle())

    this.pool.activeClientEE.on('disconnect', () => this.setState({disconnected: true}))
    this.pool.activeClientEE.on('reconnect', () => this.setState({disconnected: false}))
  }

  updateDocumentTitle() {
    const { activeServer, servers } = this.pool

    if (!activeServer) {
      return document.title = 'Decent'
    }

    const unreadStr = do {
      const unreadSum = servers
        .reduce((sum, { client }) =>
          client.channels.reduce((sum, channel) =>
            sum + (channel.unreadMessageCount || 0),
          sum),
        0)

      unreadSum === 0 ? '' : `[${unreadSum}] `
    }

    const channelStr = do {
      const activeChannel = activeServer.client.channels.nth(activeServer.ui.activeChannelIndex.get())

      activeChannel ? `#${activeChannel.name}` : ''
    }

    document.title = `${unreadStr} ${channelStr}+${activeServer.hostname} - Decent`
  }

  render(_, { isLoading, showJoinServerModal, disconnected, serverListVisible }) {
    const activeServer = this.pool.activeServer
    const failedToConnect = this.pool.failedServers.length > 0

    this.updateDocumentTitle()

    if (isLoading) {
      return <div class='App Loading'></div>
    } else if (!activeServer) {
      // TODO: better landing page
      return <Provider pool={this.pool}>
        <div class='App'>
          <Modal.Async
            title='Connect to a server'
            cancellable={false}
            submit={async ({ hostname }) => {
              if (!hostname) throw ''

              const serverIndex = await this.pool.add(hostname, false).then(i => this.pool.setActive(i)).catch(error => {
                error.realMessage = error.message
                error.message = 'Failed to connect'

                return Promise.reject(error)
              })

              // Success - switch to the newly joined server.
              this.setState({
                activeServerIndex: serverIndex,
              })
            }}
            onHide={() => this.setState({showJoinServerModal: false})}
          >
            {failedToConnect && <p class='Modal-muted'>
              <b>Failed to connect to your saved servers.</b> Decent will keep trying
              to reconnect, but in the meantime you can join another server here.
            </p>}

            <Modal.Input focus final name='hostname' label='Hostname'/>

            <Modal.Button action='submit'>Join</Modal.Button>
          </Modal.Async>
        </div>
      </Provider>
    } else {
      const { client, ui } = activeServer

      return <Provider pool={this.pool}>
        <div class='App'>
          {serverListVisible && <ServerList onAddServer={() => this.setState({showJoinServerModal: true})}/>}
          <LeftSidebar
            toggleServerList={() => {
              storage.save('serverListVisible', !this.state.serverListVisible)
              this.setState({serverListVisible: !this.state.serverListVisible})
            }}
            onJoinClick={() => this.setState({showJoinServerModal: true})}
          />
          <Messages channel={client.channels.nth(ui.activeChannelIndex.get())}/>
          <RightSidebar/>

          {showJoinServerModal && <Modal.Async
            title='Join server'
            submit={async ({ hostname }) => {
              if (hostname === '') throw ''

              const serverIndex = await this.pool.add(hostname, false).then(i => this.pool.setActive(i)).catch(error => {
                console.log(error)
                error.realMessage = error.message
                error.message = 'Failed to connect'

                return Promise.reject(error)
              })

              // Success - switch to the newly joined server.
              this.setState({
                activeServerIndex: serverIndex,
              })
            }}
            onHide={() => this.setState({showJoinServerModal: false})}
          >
            <Modal.Input focus final name='hostname' label='Hostname'/>

            <Modal.Button action='submit'>Join</Modal.Button>
            <Modal.Button class='--no-bg' action='cancel'>Cancel</Modal.Button>
          </Modal.Async>}

          {disconnected && <Toast color='red'>
            <Icon icon='disconnect'/>
            Disconnected from <b>{client.serverName}</b>!
          </Toast>}
        </div>
      </Provider>
    }
  }
}

render(<App />, document.body)
