const html = require('choo/html')
const css = require('sheetify')
const { api } = require('../../util')

const prefix = css('./authorized-users.css')

const store = (state, emitter) => {
  const reset = () => state.authorizedUsers = {
    // null if unloaded, array if loaded
    authorizedList: null,
    unauthorizedList: null,

    fetching: false,
    fetched: false,
  }

  reset()

  emitter.on('authorizedUsers.fetch', async () => {
    if (
      // this entire section is irrelevant if the server doesn't require
      // authorization..
      state.serverRequiresAuthorization === false ||

      // and it definitely won't work if the user is logged out
      state.session === null
    ) return

    state.authorizedUsers.fetching = true

    {
      // technically passing sessionID here is redundant, since api.get
      // will automatically add it, But Whatever
      const result = await api.get(state, 'user-list', {sessionID: api.sessionID})

      state.authorizedUsers.authorizedList = result.users
      state.authorizedUsers.unauthorizedList = result.unauthorizedUsers
    }

    {
      const result = await api.get(state, 'server-settings')

      state.authorizedUsers.authorizationMessage = result.authorizationMessage
    }

    state.authorizedUsers.fetching = false
    state.authorizedUsers.fetched = true
    emitter.emit('render')
  })

  emitter.on('authorizedUsers.saveMessage', async () => {
    const authorizationMessage = document.getElementById(`${prefix}message`).value

    console.log(authorizationMessage)

    await api.post(state, 'server-settings', {
      patch: {
        authorizationMessage
      }
    })

    emitter.emit('render')
  })
}

const component = (state, emit) => {
  if (state.authorizedUsers.fetched === false) {
    if (!state.authorizedUsers.fetching) {
      emit('authorizedUsers.fetch')
    }

    return html`<div class='page ${prefix}'>
      <h1>Authorized users <span class='subtitle'>on ${state.params.host}</span></h1>

      Loading...
    </div>`
  }

  return html`<div class='page ${prefix}'>
    <h1>Authorized users <span class='subtitle'>on ${state.params.host}</span></h1>

    <h2>Authorization message</h2>

    <p>Must be under 800 characters; may contain basic markdown formatting.</p>

    <p><textarea
      id='${prefix}message'
      placeholder='Authorization message'
    >${state.authorizedUsers.authorizationMessage}</textarea></p>

    <p><button onclick=${() => emit('authorizedUsers.saveMessage')}>Save</button></p>
  </div>`
}

module.exports = { store, component, prefix }
