const { h, render, Component } = require('preact')
const devTools = require('preact/devtools')

const Client = require('decent.js')

const ServerList = require('./left-sidebar/server-list.js')
const ChannelList = require('./left-sidebar/channel-list.js')
const Modal = require('./modal.js')

class App extends Component {
  state = {
    isLoading: true,

    clients: {}, // hostname -> Client map
    activeClientIndex: -1, // state.clients[] index

    showDummyModal: true,
  }

  async componentDidMount() {
    // TODO: connect to all servers in storage.get('hostnames')
    // TODO: handle connection failure

    const hostnames = ['localhost:3000', 'meta.decent.chat']
    const clientsArr = await Promise.all(hostnames.map(async hostname => {
      const client = new Client()

      await client.connectTo(hostname)

      return client
    }))

    const clients = clientsArr.reduce((map, client, index) => {
      map[hostnames[index]] = client
      return map
    }, {})

    console.log(clients)

    this.setState({
      isLoading: false,
      clients,
      activeClientIndex: 0,
    })
  }

  getActiveClient() {
    if (this.state.activeClientIndex < 0) return null
    return Object.values(this.state.clients)[this.state.activeClientIndex]
  }

  render(props, state) {
    const { isLoading, clients } = this.state
    const activeClient = this.getActiveClient()

    if (isLoading) {
      return <div class='App Loading'></div>
    } else if (!activeClient) {
      // TODO: landing page
    } else {
      document.title = activeClient.serverName

      return <div class='App'>
        <aside class='Sidebar --on-left'>
          <ServerList
              servers={Object.entries(clients).map(([ hostname, client ], index) => {
              return {
                hostname,
                name: client.serverName,
                isActive: activeClient === client,
                index,
              }
            })}
            activeServerName={activeClient.serverName}
            onJoinClick={this.actions.showJoinServerModal.bind(this)}
            switchToHost={this.actions.switchToHost.bind(this)}
          />
          <ChannelList
            channels={activeClient.channels}
          />
        </aside>

        {state.showDummyModal &&
          <Modal
            title="Dummy Modal"
            subtitle="for testing purposes"
            cancel={() => {this.setState({showDummyModal: false})}}
            complete={() => {this.setState({showDummyModal: false})}}
          >
            Hello, world!
          </Modal>
        }
      </div>
    }
  }

  actions = {
    showJoinServerModal(open) {
      // TODO
      this.setState({
        showDummyModal: true
      })
    },

    switchToHost(index) {
      this.setState({
        activeClientIndex: index,
      })
    },
  }
}

render(<App />, document.body)
