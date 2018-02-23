const css = require('sheetify')
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

    state.userList.fetching = true

    state.userList.users = (await api.get(state, 'users')).users

    state.userList.fetching = false
    emitter.emit('render')
  })

  // As soon as the user is logged in, show them as logged in in the user list.
  // If the user list is fetched before the websocket has properly connected,
  // the API will say that our session's user is not logged in. But it'll emit
  // that we've logged in *before we're even listening for users to come online*,
  // which means we'll miss that event. We use this "session user loaded" event
  // as a workaround to deal with that.
  emitter.on('sessionuserloaded', () => {
    if (state.session.user) {
      state.userList.users.find(u => u.id === state.session.user.id).online = true
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
}

const prefixSidebar = css('./sidebar.css')
const prefixUserList = css('./user-list.css')

const component = (state, emit) => {
  return html`<aside class='${prefixSidebar} ${prefixUserList}'>
    <section>
      <div class='subtitle'>
        <h4>Users</h4>
      </div>
      ${state.userList.users ? html`
        <div class='list'>
          ${state.userList.users.map(user => {
            return html`
              <div class='item user ${user.online ? 'online' : 'offline'}'>
                <div class='icon'>
                  <img src=${user.avatarURL}>
                </div>
                ${user.username}
              </div>
            `
          })}
        </div>
      ` : html`
        <div class='text'>Loading.</div>
      `}
    </section>
  </aside>`
}

module.exports = { store, component }
