const { h, render, Component } = require('preact')

const Client = require('decent.js')

const ServerList = require('./left-sidebar/server-list')
const ChannelList = require('./left-sidebar/channel-list')
const UserList = require('./right-sidebar/user-list')
const Modal = require('./modal')
const Icon = require('./icon')

class App extends Component {
  state = {
    isLoading: true,

    servers: {}, // map of hostname -> { ui, client }
    activeServerIndex: -1, // state.clients[] index

    joinServerModal: {show: false, loading: false},
  }

  async componentDidMount() {
    // TODO: connect to all servers in storage.get('hostnames')
    // TODO: handle connection failure

    const hostnames = ['localhost:3000']
    const clientsArr = await Promise.all(hostnames.map(async hostname => {
      const client = new Client()

      await client.connectTo(hostname)

      return client
    }))

    const servers = clientsArr.reduce((map, client, index) => {
      map[hostnames[index]] = {
        client,
        ui: {
          activeChannelIndex: (client.channels.length > 0) ? 0 : -1,
        },
      }
      return map
    }, {})

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

  render(props, { isLoading, servers, joinServerModal }) {
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

            onJoinClick={() => this.setState({joinServerModal: {show: true, loading: false}})}
            switchToServer={this.switchToServer.bind(this)}
          />
          <ChannelList
            channels={activeServer.client.channels}
            activeChannelIndex={activeServer.ui.activeChannelIndex}
            switchToChannel={this.switchToChannel.bind(this)}
          />
        </aside>

        {joinServerModal.show && <Modal
          title='Join a server'

          onSubmit={async data => {
            this.setState({joinServerModal: {show: true, loading: true}})

            const serverIndex = await this.joinServer(data)

            if (serverIndex > 0) {
              // Success - hide the modal & switch to the newly joined server.
              this.setState({
                activeServerIndex: serverIndex,
                joinServerModal: {show: false, loading: false},
              })
            } else {
              // Failure - display an error in the modal.
              this.setState({
                joinServerModal: {show: true, loading: false, error: 'Failed to connect.'},
              })
            }
          }}

          onCancel={() => {
            if (!this.state.joinServerModal.loading) {
              this.setState({joinServerModal: {show: false, loading: false}})
            }
          }}
        >
          {joinServerModal.loading ? <div class='Loading'/> : <div>
            {joinServerModal.error && <Modal.Error>{joinServerModal.error}</Modal.Error>}

            <Modal.Input name='hostname' label='Hostname'/>

            <Modal.Button action='cancel'>Cancel</Modal.Button>
            <Modal.Button action='submit'>Join</Modal.Button>
          </div>}
        </Modal>}

        <main></main>

        <aside class='Sidebar --on-right'>
          <div class='Tabs'>
            <div class='Tabs-tab --is-active'>
              <Icon icon='users' class='Tabs-tab-icon'/>
              <span class='Tabs-tab-text'>Users</span>
            </div>
            <div class='Tabs-tab'>
              <Icon icon='mention' class='Tabs-tab-icon'/>
              <span class='Tabs-tab-text'>Mentions</span>
            </div>
            <div class='Tabs-tab'>
              <Icon icon='pin' class='Tabs-tab-icon'/>
              <span class='Tabs-tab-text'>Pins</span>
            </div>
          </div>

          <UserList
            users={activeServer.client.users}
          />
        </aside>
      </div>
    }
  }

  async joinServer({ hostname }) {
    // TODO
    console.log(hostname)
  }

  switchToServer(index) {
    this.setState({
      activeServerIndex: index,
    })
  }

  switchToChannel(index) {
    let s = Object.assign({}, this.state) // Don't mutate state directly!
    this.getActiveServer(s).ui.activeChannelIndex = index
    this.setState(s)
  }
}

render(<App />, document.body)
