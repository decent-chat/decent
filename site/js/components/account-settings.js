// sidebar component
const html = require('choo/html')
const css = require('sheetify')
const { api } = require('../util')

const prefix = css('./account-settings.css')

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
        const { avatarURL } = await api.post(state.params.host, 'account-settings', {
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
  </div>`
}

module.exports = { component, prefix }
