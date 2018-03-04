const { h, render, Component } = require('preact')
const devTools = require('preact/devtools')

const Client = require('decent.js')

const ServerList = require('./left-sidebar/server-list.js')
const ChannelList = require('./left-sidebar/channel-list.js')
const UserList = require('./right-sidebar/user-list.js')
const Modal = require('./modal.js')

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
              <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='Tabs-tab-icon'>
                <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'></path>
                <circle cx='9' cy='7' r='4'></circle>
                <path d='M23 21v-2a4 4 0 0 0-3-3.87'></path>
                <path d='M16 3.13a4 4 0 0 1 0 7.75'></path>
              </svg>
              <span class='Tabs-tab-text'>Users</span>
            </div>
            <div class='Tabs-tab'>
              <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='Tabs-tab-icon'>
                <circle cx='12' cy='12' r='4'></circle>
                <path d='M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94'></path>
              </svg>
              <span class='Tabs-tab-text'>Mentions</span>
            </div>
            <div class='Tabs-tab'>
              <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='Tabs-tab-icon'>
                <path d='M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'></path>
              </svg>
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
