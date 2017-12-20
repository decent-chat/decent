// message editor component
const html = require('choo/html')
const css = require('sheetify')
const api = require('../util/api')

const prefix = css('./message-editor.css')

const component = (state, emit) => {
  const textarea = html`<textarea placeholder='Enter a message...'></textarea>`

  async function send() {
    const text = textarea.value.trim()

    if (text.length === 0) return
    textarea.value = ''

    await api.post(state, 'send-message', {
      text,
      channelID: state.params.channel,
      sessionID: state.session.id,
    })
  }

  textarea.addEventListener('keydown', evt => {
    const key = evt.which

    // enter
    if (key === 13) {
      if (evt.shiftKey) {
        // if shift is down, enter a newline
        // this is default behaviour
      } else {
        // if shift is not down, send the message
        evt.preventDefault()
        send()
      }
    }
  })

  if (state.session) {
    const editor = html`<div class=${prefix}>
      ${textarea}
      <button onclick=${send}>Send</button>
    </div>`

    // we only want to morph the editor element if it's changed to being
    // logged out (at which point the actual content will have changed, so
    // replacing it is necessary).
    editor.isSameNode = a => {
      return a.classList === editor.classList
    }

    return editor
  } else {
    return html`<div class='${prefix} logged-out'>
      You must be logged in to send messages
    </div>`
  }
}

module.exports = { component, prefix }
