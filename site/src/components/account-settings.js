const html = require('choo/html')
const css = require('sheetify')
const { api } = require('../util')
const { timeAgo } = require('../util/date')

const prefix = css('./account-settings.css')

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

    const { sessions } = await api.get(state, 'user-session-list', {
      sessionID: state.session.id
    })

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
      const { sessions } = await api.get(state, 'user-session-list', {
        sessionID: state.session.id
      })

      await api.post(state, 'delete-sessions', {
        sessionIDs: sessions.map(session => session.id)
      })

      emitter.emit('sidebar.logout')
    }
  })
}

const component = (state, emit) => {
  if (!state.session) {
    // not logged in
    return html`<div class='page'>
      Not logged in.
    </div>`
  }

  const save = async () => {
    const email = document.getElementById(prefix + 'email').value.trim() || null
    const statusEl = document.querySelector(`.${prefix} > .submit > .status`)

    // update if unchanged
    if (email !== state.session.user.email) {
      statusEl.innerText = 'Saving...'

      try {
        const { avatarURL } = await api.post(state, 'account-settings', {
          email,
          sessionID: state.session.id,
        })

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

        await api.post(state, 'delete-sessions', {
          sessionIDs: [session.id]
        })

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
          <td><button class='styled-button no-bg red' onclick=${deleteSession}>Delete</button></td>
        </tr>
      `

      row.isSameNode = el => el.dataset && el.dataset.sessionid === session.id

      return row
    })
  }

  return html`<div class='page ${prefix}'>
    <h1>Account settings <span class='subtitle'>for ${state.params.host}</span></h1>

    <div class='styled-input'>
      <label for='${prefix}username'>Username</label>
      <input id='${prefix}username' type='text' disabled value=${state.session.user.username}/>
    </div>

    <div class='styled-input'>
      <label>Password</label>
      <button class='styled-button no-bg' onclick=${() => alert('not implemented')}>Change password</button>
    </div>

    <div class='styled-input avatar'>
      <label for='${prefix}email'>Avatar</label>

      <input id='${prefix}email' type='email' placeholder='Email address' value=${state.session.user.email || ''}/>
      <img src=${state.session.user.avatarURL}/>
    </div>

    <p>
      We use <a class='link' href='https://www.libravatar.org/'>Libravatar</a> for avatars, which falls back to Gravatar.
    </p>

    <div class='submit'>
      <span class='status'></span>
      <button class='styled-button save' onclick=${save}>Save</button>
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
          class='styled-button red'
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

module.exports = { store, component, prefix }
