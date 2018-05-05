const { h, Component } = require('preact')
const UserPopup = require('/UserPopup')

class UserList extends Component {
  state = {users: [], popup: null}

  componentDidMount() {
    const { pool } = this.context

    this.setState({users: pool.activeServer.client.users})

    pool.activeUsersEE.on('change', users => {
      this.setState({users})
    })
  }

  render(_, { users, popup }) {
    const usersSorted = users.sort((a, b) => {
      if (a.online && !b.online) return -1
      if (b.online && !a.online) return 1

      if(a.username.toLowerCase() < b.username.toLowerCase()) return -1
      if(a.username.toLowerCase() > b.username.toLowerCase()) return 1

      return 0
    })

    return <section class='Sidebar-section'>
      <div class='Sidebar-list UserList'>
        {usersSorted.map(user => {
          let title = user.username +
            (user.flair ? ` {${user.flair}}` : '') +
            (user.online ? ' (Online)' : ' (Offline)')

          let className =
            'Sidebar-list-item UserList-user ' +
            (user.online ? 'is-online' : 'is-offline')

          return <div title={title} class={className} onClick={e =>
            this.setState({popup: {
              x: e.clientX,
              y: e.clientY,
              user,
            }})
          }>
            <div class='UserList-user-avatar'>
              <img src={user.avatarURL} class='Avatar' alt='' />
            </div>
            <span class='UserList-user-username'>{user.username}</span>
          </div>
        })}
      </div>

      {popup && <UserPopup
        user={popup.user}
        x={popup.x}
        y={popup.y}
        onClose={() => this.setState({popup: null})}
      />}
    </section>
  }
}

module.exports = UserList
