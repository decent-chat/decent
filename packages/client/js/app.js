const { h, render, Component } = require('preact')
const Provider = require('preact-context-provider')
const Pool = require('./server-pool')

const ServerList = require('./left-sidebar/server-list')
const ChannelList = require('./left-sidebar/channel-list')
const UserList = require('./right-sidebar/user-list')
const Modal = require('./modal')
const Icon = require('./icon')

class App extends Component {
  state = {
    isLoading: true,
    joinServerModal: {show: false, loading: false},
  }

  pool = new Pool()

  async componentDidMount() {
    await this.pool.add('localhost:3000')
    await this.pool.setActive(0)

    this.setState({
      isLoading: false,
    })
  }

  render(_, { isLoading, joinServerModal }) {
    const activeServer = this.pool.activeServer

    if (isLoading) {
      return <div class='App Loading'></div>
    } else if (!activeServer) {
      // TODO: landing page
    } else {
      document.title = activeServer.client.serverName

      return <Provider pool={this.pool}>
        <div class='App'>
          <aside class='Sidebar --on-left'>
            <ServerList
              servers={this.pool.servers.map(({ hostname, client }, index) => {
                return {
                  hostname,
                  name: client.serverName,
                  isActive: activeServer.hostname === hostname,
                  index,
                }
              })}
              activeServerName={activeServer.client.serverName}
              onJoinClick={() => this.setState({joinServerModal: {show: true, loading: false}})}
            />
            <ChannelList/>
          </aside>

          {joinServerModal.show && <Modal
            title='Join a server'

            onSubmit={async ({ hostname }) => {
              this.setState({joinServerModal: {show: true, loading: true}})

              try {
                const serverIndex = await this.pool.setActive(await this.pool.add(hostname))

                // Success - hide the modal & switch to the newly joined server.
                this.setState({
                  activeServerIndex: serverIndex,
                  joinServerModal: {show: false, loading: false},
                })
              } catch (error) {
                console.error('Error whilst joining server:', error)

                // Failure - display an error in the modal.
                this.setState({
                  joinServerModal: {
                    show: true,
                    loading: false,
                    error: 'Failed to connect',
                  },
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

            <UserList/>
          </aside>
        </div>
      </Provider>
    }
  }
}

render(<App />, document.body)
