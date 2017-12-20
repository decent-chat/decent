const html = require('choo/html')
const api = require('../util/api')

module.exports = (state, emit) => {
  const textarea = html`<textarea
    class='message-editor-input'
    placeholder='Enter a message...'
    onkeydown=${onkeydown}>
  </textarea>`

  async function send() {
    const text = textarea.value.trim()

    if (text.length === 0) return
    textarea.value = ''

    await api.post(state.host, 'send-message', {
      text,
      channelID: state.channel.id,
      sessionID: state.sessionID,
    })
  }

  function onkeydown(evt) {
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
  }

  if (state.sessionID !== null) {
    const editor = html`<div class='message-editor'>
      ${textarea}
      <button class='message-editor-button' onclick=${send}>Send</button>
    </div>`

    editor.isSameNode = (a) => {
      // classname will be different between this state & not logged in
      // we don't really need to morph this dom element very much
      if (editor.className === a.className) return true
    }

    return editor
  } else {
    // not logged in
    return html`<div class='message-editor not-logged-in'>
      You must be logged in to send messages
    </div>`
  }
}
