// message editor component
const html = require('choo/html')
const api = require('../util/api')
const mrk = require('mrk.js')

const component = (state, emit) => {
  const textarea = html`<textarea class='MessageEditor-textarea' placeholder='Enter a message...'></textarea>`

  async function send() {
    const text = textarea.value.trim()

    if (text.length === 0) return
    textarea.value = ''

    const textFormatted = mrk({
      extendPatterns: {
        code({ read, has }) {
          if(read() === '`') {
            if (read() === '`') return false

            // Eat up every character until another backtick
            let escaped = false, char, n

            while (char = read()) {
              if (char === '\\' && !escaped) escaped = true
              else if (char === '`' && !escaped) return true
              else escaped = false
            }
          }
        },

        codeblock({ read, readUntil, look }, meta) {
          if (read(3) !== '```') return

          let numBackticks = 3
          while (look() === '`') {
            numBackticks++
            read()
          }

          // All characters up to newline following the intial
          // set of backticks represent the language of the code
          let lang = readUntil('\n')
          read()

          // Final fence
          let code = ''
          while (look(numBackticks) !== '`'.repeat(numBackticks)) {
            if (look().length === 0) return false // We've reached the end
            code += read()
          }

          read(numBackticks)
          if (look() !== '\n' && look() !== '') return false

          // Set metadata
          meta({ lang, code })

          return true
        },

        mention({ read, look }, meta) {
          if (read(1) !== '@') return false

          let username = ''
          while (c = look()) {
            if (/[a-zA-Z0-9-_]/.test(c) === false) break
            username += read()
          }

          const user = state.userList.users.find(usr => usr.username === username)

          if (!user) return false
          meta({user})

          return true
        },
      },

      extendHtmlify: {
        code({ text }) {
          return text
        },

        codeblock({ text }) {
          return text
        },

        mention({ metadata: { user } }) {
          return `<@${user.id}>`
        },
      }
    })(text).html()

    await api.post(state, 'messages', {
      text: textFormatted, channelID: state.params.channel,
    })
  }

  textarea.addEventListener('keydown', evt => {
    const key = (evt.which || evt.keyCode)

    if (key === 13) {
      // enter/return
      if (evt.shiftKey) {
        // if shift is down, enter a newline
        // this is default behaviour
      } else {
        // if shift is not down, send the message
        evt.preventDefault()
        send()
      }
    } else if (key === 38) {
      // up arrow
      if (evt.altKey) {
        evt.preventDefault()
        emit('sidebar.upchannel')
      }
    } else if (key === 40) {
      // down arrow
      if (evt.altKey) {
        evt.preventDefault()
        emit('sidebar.downchannel')
      }
    }
  })

  const progressBar = html`<div class='MessageEditor-progressBar'></div>`

  textarea.addEventListener('paste', async evt => {
    if (!evt.clipboardData) return
    if (progressBar.classList.contains('is-moving')) return

    const img = evt.clipboardData.files[0]

    if (!img || img.type.indexOf('image') === -1) return

    evt.preventDefault()

    // upload the image file
    const formData = new FormData()
    formData.append('image', img)

    progressBar.style.width = '60%'
    progressBar.classList.add('is-moving')

    try {
      console.log(state.session.id)
      const { path } = await api.postRaw(state, 'upload-image?sessionID=' + state.session.id, formData)

      progressBar.style.width = '90%'

      // send a message with the image in it
      await api.post(state, 'messages', {
        text: `![](${state.secure ? 'https' : 'http'}://${state.params.host}${path})`,
        channelID: state.params.channel
      })

      progressBar.style.width = '100%'
      await api.sleep(500)
    } catch (err) {
      console.error(err)
    } finally {
      progressBar.classList.remove('is-moving')
    }
  })

  if (state.session.id) {
    const editor = html`<div class='MessageEditor'>
      ${textarea}
      <button class='MessageEditor-sendButton' onclick=${send}>Send</button>
      ${progressBar}
    </div>`

    // we only want to morph the editor element if it's changed to being
    // logged out (at which point the actual content will have changed, so
    // replacing it is necessary).
    editor.isSameNode = a => {
      return a.className === editor.className
    }

    // Hack!!! - Select the textarea *soon*. We assume that the component is
    // rendered and on the page by 25ms from now.
    setTimeout(() => {
      textarea.focus()
    }, 25)

    return editor
  } else {
    return html`<div class='MessageEditor --disabled'>
      You must be logged in to send messages
    </div>`
  }
}

module.exports = { component }
