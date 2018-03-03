const { h, render, Component } = require('preact')
const devTools = require('preact/devtools')

const Client = require('decent.js')

const ServerList = require('./left-sidebar/server-list.js')
const ChannelList = require('./left-sidebar/channel-list.js')
const Modal = require('./modal.js')

class App extends Component {
  state = {
    isLoading: true,

    servers: {}, // map of hostname -> { ui, client }
    activeServerIndex: -1, // state.clients[] index

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

    const servers = clientsArr.reduce((map, client, index) => {
      map[hostnames[index]] = {
        client,
        ui: {
          activeChannelIndex: (client.channels.length > 0) ? 0 : -1
        }
      }
      return map
    }, {})

    console.log(servers)

    this.setState({
      isLoading: false,
      servers,
      activeServerIndex: 0,
    })
  }

  getActiveServer(state) {
    if(!state) state = this.state
    if (state.activeServerIndex < 0) return null
    return Object.values(state.servers)[state.activeServerIndex]
  }

  render(props, state) {
    const { isLoading, servers } = this.state
    const activeServer = this.getActiveServer()

    if (isLoading) {
      return <div class='App Loading'></div>
    } else if (!activeServer) {
      // TODO: landing page
    } else {
      document.title = activeServer.client.serverName

      return <div class='App'>
        <aside class='Sidebar --on-left'>
          <ServerList
              servers={Object.entries(servers).map(([hostname, server], index) => {
              return {
                hostname,
                name: server.client.serverName,
                isActive: activeServer === server,
                index,
              }
            })}
            activeServerName={activeServer.client.serverName}
            onJoinClick={this.actions.showJoinServerModal.bind(this)}
            switchToHost={this.actions.switchToHost.bind(this)}
          />
          <ChannelList
            channels={activeServer.client.channels}
            activeChannelIndex={activeServer.ui.activeChannelIndex}
            switchToChannel={this.actions.switchToChannel.bind(this)}
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
        activeServerIndex: index,
      })
    },

    switchToChannel(index) {
      let s = Object.assign({}, this.state) // Don't mutate state directly!
      this.getActiveServer(s).ui.activeChannelIndex = index
      this.setState(s)
    }
  }
}

render(<App />, document.body)
