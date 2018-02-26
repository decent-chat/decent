const html = require('choo/html')
const api = require('../util/api')

const store = (state, emitter) => {
  const reset = () => state.userList = {
    users: null,
    fetching: false,
    oldHost: null
  }

  reset()

  emitter.on('route', () => {
    if (state.params.host && state.params.host !== state.userList.oldHost) {
      emitter.emit('userlist.fetch')
    }
  })

  emitter.on('userlist.fetch', async () => {
    if (state.userList.fetching) {
      return
    }

    if (!state.sessionAuthorized) {
      return
    }

    state.userList.fetching = true

    try {
      state.userList.users = (await api.get(state, 'users')).users
    } catch (error) {
      if (error.code === 'AUTHORIZATION_ERROR') {
        state.userList.users = null
      } else {
        throw error
      }
    }

    state.userList.fetching = false
    emitter.emit('render')
  })

  // As soon as the user is logged in, show them as logged in in the user list.
  // If the user list is fetched before the websocket has properly connected,
  // the API will say that our session's user is not logged in. But it'll emit
  // that we've logged in *before we're even listening for users to come online*,
  // which means we'll miss that event. We use this login event (emitted after
  // the session user is loaded) as a workaround to deal with that.
  emitter.on('login', () => {
    if (state.session.user) {
      if (state.userList.users) {
        state.userList.users.find(u => u.id === state.session.user.id).online = true
      } else if (state.serverRequiresAuthorization) {
        // If the server requires authorization, now is a good time to fetch the
        // user list.
        emitter.emit('userlist.fetch')
      }
    }
  })

  emitter.on('ws.user/online', data => {
    if (state.userList.users) {
      const user = state.userList.users.find(u => u.id === data.userID)
      // Only show the user as online if they existed before.
      // Totally new users should be handled by a "user created" event
      // somewhere else.
      if (user) {
        user.online = true
        emitter.emit('render')
      }
    }
  })

  emitter.on('ws.user/offline', data => {
    if (state.userList.users) {
      const user = state.userList.users.find(u => u.id === data.userID)
      if (user) {
        user.online = false
        emitter.emit('render')
      }
    }
  })

  emitter.on('ws.user/new', data => {
    if (state.userList.users) {
      state.userList.users.push(data.user)
      emitter.emit('render')
    }
  })

  emitter.on('ws.user/gone', data => {
    if (state.userList.users) {
      const index = state.userList.users.findIndex(u => u.id === data.userID)

      if (index >= 0) {
        state.userList.users.splice(index, 1)
        emitter.emit('render')
      }
    }
  })
}

const component = (state, emit) => {
  return html`<aside class='Sidebar'>
    <section class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Users</h4>
      </div>
      ${state.userList.users ? html`
        <div class='Sidebar-list UserList'>
          ${state.userList.users.slice().sort((a, b) => {
            if (a.online && !b.online) {
              return -1
            }

            if (b.online && !a.online) {
              return +1
            }

            if (a.username < b.username) {
              return -1
            }

            if (b.username < a.username) {
              return +1
            }

            return 0
          }).map(user => {
            return html`
              <div
                class='Sidebar-list-item UserList-user ${user.online ? 'is-online' : 'is-offline'}'
                title='${user.username} (${user.online ? 'Online' : 'Offline'})'
              >
                <div class='UserList-user-avatar'>
                  <img src=${user.avatarURL}>
                </div>
                <span class='UserList-user-username'>${user.username}</span>
              </div>
            `
          })}
        </div>
      ` : state.userList.fetching ? html`
        <div class='Sidebar-section-content'>Loading.</div>
      ` : html`
        <div class='Sidebar-section-content'>User list not fetched.</div>
      `}
    </section>
  </aside>`
}

module.exports = { store, component }
