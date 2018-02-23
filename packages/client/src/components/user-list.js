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
