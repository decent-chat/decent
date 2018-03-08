const html = require('choo/html')
const { svg, api } = require('../util')
const messageGroup = require('./message-group')

const store = (state, emitter) => {
  const reset = () => {
    state.sidebarRight = {tab: 'users'}

    state.userList = {
      users: null,
      fetching: false,
      oldHost: null,
    }

    state.mentions = {fetched: false, fetching: false, messages: []}
    state.pins = {fetched: false, fetching: false, messages: []}
  }

  reset()

  emitter.on('route', () => {
    if (state.params.host && state.params.host !== state.userList.oldHost) {
      state.pins.fetched = false
      state.pins.fetching = false
      state.pins.messages = []

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

  emitter.on('ws.user/update', data => {
    if (state.userList.users) {
      const index = state.userList.users.findIndex(u => u.id === data.user.id)

      if (index >= 0) {
        state.userList.users.splice(index, 1)
        state.userList.users.push(data.user)
        emitter.emit('render')
      }
    }
  })

  emitter.on('ws.channel/pins/add', ({ message }) => {
    state.pins.messages.push(message)
    emitter.emit('render')
  })

  emitter.on('ws.channel/pins/remove', ({ messageID }) => {
    state.pins.messages = state.pins.messages.filter(m => m.id !== messageID)
    emitter.emit('render')
  })

  emitter.on('ws.user/mentions/add', ({ message }) => {
    state.mentions.messages.unshift(message)
    emitter.emit('render')
  })

  emitter.on('ws.user/mentions/remove', ({ messageID }) => {
    state.mentions.messages = state.mentions.messages.filter(m => m.id !== messageID)
    emitter.emit('render')
  })
}

const component = (state, emit) => {
  let content = document.createTextNode('')

  switch (state.sidebarRight.tab) {
    case 'users':
      content = state.userList.users ? html`
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
                title='${user.username}${user.flair ? ` {${user.flair}}` : ''} (${user.online ? 'Online' : 'Offline'})'
                onclick=${() => {
                  const textarea = document.querySelector('.MessageEditor-textarea')

                  if (textarea) {
                    if (textarea.value.length > 0) {
                      const lastChar = textarea.value[textarea.value.length - 1]
                      if (lastChar !== ' ' && lastChar !== '\n') textarea.value += ' '
                    }

                    textarea.value += '@' + user.username + ' '
                  }
                }}
              >
                <div class='UserList-user-avatar'>
                  <img class='Avatar' src=${user.avatarURL}>
                </div>
                <span class='UserList-user-username'>${user.username}</span>
              </div>
            `
          })}
        </div>
      ` : html`
        <div class='Sidebar-section-content Loading'></div>
      `

      break

    case 'mentions':
      if (state.mentions.fetched === false && state.mentions.fetching === false) {
        state.mentions.fetching = true

        api.get(state, `users/${state.session.user.id}`).then(({ user }) => {
          state.mentions.fetched = true
          state.mentions.fetching = false
          state.mentions.messages = user.mentions

          emit('render')
        })
      }

      content = state.mentions.fetching ? html`
        <div class='Sidebar-section-content Loading'></div>
      ` : html`
        <div class='Sidebar-list'>
          ${state.mentions.messages.filter(message => {
            return message.channelID === state.params.channel
          }).map(message => {
            const group = messageGroup.component(state, emit, {
              id: 'mentioned-message-' + message.id,
              authorUsername: message.authorUsername,
              authorAvatarURL: message.authorAvatarURL,
              authorFlair: message.authorFlair,
              date: message.date,
              messages: [message],
            }, {withActions: false, showFlair: false, msgIDprefix: 'mentioned-msg-'})

            group.style.pointerEvents = 'none'
            group.style.width = '100%'
            group.style.overflowWrap = 'break-word'

            return html`
              <div class='Sidebar-list-item' onclick=${() => {
                emit('messages.jumptomessage', message.id)
              }}>
                ${group}
              </div>
            `
          })}
        </div>
      `

      break

    case 'pins':
      if (state.pins.fetched === false && state.pins.fetching === false) {
        state.pins.fetching = true

        api.get(state, `channels/${state.params.channel}/pins`).then(({ pins }) => {
          state.pins.fetched = true
          state.pins.fetching = false
          state.pins.messages = pins

          emit('render')
        })
      }

      content = state.pins.fetching ? html`
        <div class='Sidebar-section-content Loading'></div>
      ` : html`
        <div class='Sidebar-list'>
          ${state.pins.messages.map(message => {
            const group = messageGroup.component(state, emit, {
              id: 'pinned-message-' + message.id,
              authorUsername: message.authorUsername,
              authorAvatarURL: message.authorAvatarURL,
              authorFlair: message.authorFlair,
              date: message.date,
              messages: [message],
            }, {withActions: false, showFlair: false, msgIDprefix: 'pinned-msg-'})

            group.style.pointerEvents = 'none'
            group.style.width = '100%'
            group.style.overflowWrap = 'break-word'

            return html`
              <div class='Sidebar-list-item' onclick=${() => {
                emit('messages.jumptomessage', message.id)
              }}>
                ${group}
              </div>
            `
          })}
        </div>
      `

      break
  }

  return html`<aside class='Sidebar --on-right'>
    ${(() => {
      const el = html`<div class='Tabs'></div>`
      const tabs = Object.assign({
        users: {name: 'Users', icon: require('../../img/users.svg')},
      }, state.params.channel ? {
        mentions: {name: 'Mentions', icon: require('../../img/at-sign.svg')},
        pins: {name: 'Pins', icon: require('../../img/paperclip.svg')},
      } : {})

      if (!Object.keys(tabs).includes(state.sidebarRight.tab)) {
        state.sidebarRight.tab = 'users'
      }

      for (const [ id, { name, icon } ] of Object.entries(tabs)) {
        const tab = html`<div class='Tabs-tab'>
          ${svg(icon, {class: 'Tabs-tab-icon'})}
          <span class='Tabs-tab-text'>${name}</span>
        </div>`

        if (state.sidebarRight.tab === id) {
          tab.classList.add('--is-active')
        } else {
          tab.onclick = () => {
            state.sidebarRight.tab = id
            emit('render')
          }
        }

        el.appendChild(tab)
      }

      return el
    })()}
    <section class='Sidebar-section'>
      ${content}
    </section>
  </aside>`
}

module.exports = { store, component }
