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

  const progressBar = html`<div class='progress-bar'></div>`

  textarea.addEventListener('paste', async evt => {
    if (!evt.clipboardData) return
    if (progressBar.classList.contains('moving')) return

    const img = evt.clipboardData.files[0]

    if (!img || img.type.indexOf('image') === -1) return

    evt.preventDefault()

    // upload the image file
    const formData = new FormData()
    formData.append('image', img)

    progressBar.style.width = '60%'
    progressBar.classList.add('moving')

    try {
      const { path } = await api.postRaw(state, 'upload-image?sessionID=' + state.session.id, formData)

      progressBar.style.width = '90%'

      // send a message with the image in it
      await api.post(state, 'send-message', {
        text: `![](${state.secure ? 'https' : 'http'}://${state.params.host}${path})`,
        channelID: state.params.channel,
        sessionID: state.session.id,
      })

      progressBar.style.width = '100%'
      await api.sleep(500)
    } catch (err) {
      console.error(err)
    } finally {
      progressBar.classList.remove('moving')
    }
  })

  if (state.session) {
    const editor = html`<div class=${prefix}>
      ${textarea}
      <button onclick=${send}>Send</button>
      ${progressBar}
    </div>`

    // we only want to morph the editor element if it's changed to being
    // logged out (at which point the actual content will have changed, so
    // replacing it is necessary).
    editor.isSameNode = a => {
      return a.className === editor.className
    }

    return editor
  } else {
    return html`<div class='${prefix} logged-out'>
      You must be logged in to send messages
    </div>`
  }
}

module.exports = { component, prefix }
