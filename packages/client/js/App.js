const { h, render, Component } = require('preact')
const Provider = require('preact-context-provider')
const Pool = require('./ServerPool')
const Atom = require('./ServerPool/Atom')

if (process.env !== 'production') {
  require('preact/debug')
  require('preact/devtools')
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

    await this.pool.add('localhost:3000')
    await this.pool.setActive(0)

    this.setState({
      isLoading: false,
    })

    this.pool.onUIChange('activeChannelIndex', () => this.forceUpdate())
    this.pool.activeClientEE.on('disconnect', () => this.setState({disconnected: true}))
    this.pool.activeClientEE.on('reconnect', () => this.setState({disconnected: false}))
  }

  render(_, { isLoading, showJoinServerModal, disconnected, serverListVisible }) {
    const activeServer = this.pool.activeServer

    if (isLoading) {
      return <div class='App Loading'></div>
    } else if (!activeServer) {
      // TODO: better landing page
      return <Provider pool={this.pool}>
        <div class='App'>
          <Modal.Async
            title='Join a server'
            cancellable={false}
            submit={async ({ hostname }) => {
              const serverIndex = await this.pool.setActive(await this.pool.add(hostname)).catch(error => {
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
          </Modal.Async>
        </div>
      </Provider>
    } else {
      const { client, ui } = activeServer
      document.title = client.serverName

      return <Provider pool={this.pool}>
        <div class='App'>
          {serverListVisible && <ServerList onAddServer={() => this.setState({showJoinServerModal: true})}/>}
          <LeftSidebar
            toggleServerList={() => this.setState({serverListVisible: !this.state.serverListVisible})}
            onJoinClick={() => this.setState({showJoinServerModal: true})}
          />
          <Messages channel={client.channels.nth(ui.activeChannelIndex.get())}/>
          <RightSidebar/>

          {showJoinServerModal && <Modal.Async
            title='Join server'
            submit={async ({ hostname }) => {
              const serverIndex = await this.pool.setActive(await this.pool.add(hostname)).catch(error => {
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

          {disconnected && <Toast>
            <Icon icon='disconnect'/>
            Disconnected from <b>{client.serverName}</b>!
          </Toast>}
        </div>
      </Provider>
    }
  }
}

render(<App />, document.body)
