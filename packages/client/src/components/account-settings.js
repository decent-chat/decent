const html = require('choo/html')
const { api } = require('../util')
const { timeAgo } = require('../util/date')

const store = (state, emitter) => {
  const reset = () => state.accountSettings = {
    sessionList: null,
    fetchingSessions: false,
    oldRoute: '/',
    shouldFetchSessionsAgain: false,
  }

  reset()

  emitter.on('login', () => reset())

  emitter.on('route', () => {
    if (state.accountSettings.oldRoute !== state.route) {
      // since the route is different, we consider the session list "outdated"
      // and set a flag to fetch it again the next time the account settings
      // component is rendered
      state.accountSettings.shouldFetchSessionsAgain = true
      state.accountSettings.oldRoute = state.route
    }
  })

  emitter.on('accountSettings.fetchSessions', async () => {
    state.accountSettings.fetchingSessions = true

    const { sessions } = await api.get(state, 'sessions')

    sessions.sort((a, b) => b.dateCreated - a.dateCreated)

    state.accountSettings.sessionList = sessions
    state.accountSettings.fetchingSessions = false
    emitter.emit('render')
  })

  emitter.on('accountSettings.deleteAllSessions', async () => {
    if (confirm(
      'Are you sure? Deleting all sessions will log you out ' +
      '(but you can log back in after).'
    )) {
      // fetch the list again, just to be up to date - deleting all sessions
      // should delete ALL sessions, not just the ones that existed when the
      // settings page was opened
      const { sessions } = await api.get(state, 'sessions')

      await Promise.all(sessions.map(session => {
        return api.delete(state, 'sessions/' + session.id)
      }))

      emitter.emit('sidebar.logout')
    }
  })
}

const component = (state, emit) => {
  if (!state.session) {
    // not logged in
    return html`<div class='Page'>
      Not logged in.
    </div>`
  }

  const save = async () => {
    const email = document.getElementById('acc-settings-email').value.trim() || null
    const statusEl = document.querySelector(`.acc-settings > .submit > .status`)

    // update if unchanged
    if (email !== state.session.user.email) {
      statusEl.innerText = 'Saving...'

      try {
        const { avatarURL } = await api.post(state, 'account-settings', {email})

        Object.assign(state.session.user, {
          email, avatarURL,
        })

        emit('render')
        setTimeout(() => {
          statusEl.innerText = 'Saved'
        }, 25)
      } catch (error) {
        statusEl.innerText = 'Error!'
        console.error(error)
      }
    }
  }

  let sessionRows

  if (state.accountSettings.sessionList === null || state.accountSettings.shouldFetchSessionsAgain) {
    state.accountSettings.shouldFetchSessionsAgain = false
    if (!state.accountSettings.fetchingSessions) {
      emit('accountSettings.fetchSessions')
    }
  } else {
    sessionRows = state.accountSettings.sessionList.map(session => {
      const deleteSession = async () => {
        if (session.id === state.session.id) {
          if (!confirm(
            'Are you sure? Deleting this session will log you out ' +
            '(since it\'s the one you\'re currently logged in with).'
          )) {
            return
          }
        }

        state.accountSettings.sessionList = state.accountSettings.sessionList.filter(
          s => s.id !== session.id
        )

        await api.delete(state, 'sessions/' + session.id)

        if (session.id === state.session.id) {
          emit('sidebar.logout')
        } else {
          emit('render')
        }
      }

      const row = html`
        <tr data-sessionid=${session.id}>
          <td>
            Created: ${timeAgo(session.dateCreated).string}
            ${session.id === state.session.id ? '(Current)' : ''}
          </td>
          <td>
            <span class='session-id'>${session.id}</span>
          </td>
          <td><button class='Button --no-bg --red' onclick=${deleteSession}>Delete</button></td>
        </tr>
      `

      row.isSameNode = el => el.dataset && el.dataset.sessionid === session.id

      return row
    })
  }

  return html`<div class='Page acc-settings'>
    <h1 class='Page-title'>Account settings <span class='Page-subtitle'>for ${state.params.host}</span></h1>

    <div class='Button'>
      <label for='acc-settings-username'>Username</label>
      <input id='acc-settings-username' type='text' disabled value=${state.session.user.username}/>
    </div>

    <div class='Input avatar'>
      <label for='acc-settings=email'>Avatar</label>

      <input id='acc-settings-email' type='email' placeholder='Email address' value=${state.session.user.email || ''}/>
      <img src=${state.session.user.avatarURL}/>
    </div>

    <p>
      We use <a class='link' href='https://www.libravatar.org/'>Libravatar</a> for avatars, which falls back to Gravatar.
    </p>

    <div class='submit'>
      <span class='status'></span>
      <button class='Button save' onclick=${save}>Save</button>
    </div>

    <h2>Login sessions</h2>
    ${state.accountSettings.fetching ? html`
      <p>Loading sessions...</p>
    ` : html`
      <div>
        <p>
          These are your login sessions. <strong>The blurred-out codes should <em>never</em> be shared - they give <em>anybody</em> full access to your account.</strong> Old login sessions (any older than 30 days) are automatically deleted, so you'll need to login roughly once a month (if you're not the type to log out every time).
        </p>
        <p><button
          class='Button --red'
          onclick=${() => emit('accountSettings.deleteAllSessions')}
        >Delete all login sessions</button></p>
        <table>
          <tbody>
            ${sessionRows}
          </tbody>
        </table>
      </div>
    `}
  </div>`
}

module.exports = { store, component }
