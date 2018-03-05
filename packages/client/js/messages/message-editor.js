const { h, Component } = require('preact')
const mrk = require('mrk.js')

class MessageEditor extends Component {
  constructor() {
    super()

    this.state = {
      message: '',
      me: null,
    }

    this.handleEdit = this.handleEdit.bind(this)
    this.sendMessage = this.sendMessage.bind(this)
    this.sendMessageFromInput = this.sendMessageFromInput.bind(this)
    this.handleKeyPress = this.handleKeyPress.bind(this)
    this.handlePaste = this.handlePaste.bind(this)
  }

  componentDidMount() {
    const { pool } = this.context

    const onLogin = () => {
      const { me } = pool.activeServer.client

      this.setState({me})

      me.on('change', () => {
        // this.state.me may update automatically but we need to rerender
        this.forceUpdate()
      })
    }

    pool.activeClientEE.on('login', onLogin)
    if (pool.activeServer.client.me) onLogin()

    pool.activeClientEE.on('logout', () => {
      this.setState({me: null})
    })
  }

  render({ sendMessage }, { message, me }) {
    if (!me) return <div class='MessageEditor'>You must be signed in to send messages.</div>

    return <div class='MessageEditor'>
      <textarea
        placeholder='Enter a message...'
        class='MessageEditor-textarea'
        value={message}
        onChange={this.handleEdit}
        onKeyDown={this.handleKeyPress}
        onPaste={this.handlePaste}
      ></textarea>
      <button
        class='MessageEditor-sendButton'
        onClick={this.sendMessageFromInput}
      >
        Send
      </button>
      <div class='MessageEditor-progressBar'></div>
    </div>
  }

  handleEdit(e) {
    this.setState({
      message: e.target.value
    })
  }

  sendMessage(message) {
    if(!message) return

    let messageFormatted = this.parseMarkdown(message)
    this.props.sendMessage(messageFormatted)
  }

  sendMessageFromInput() {
    if(this.state.message === '') return false

    this.sendMessage(this.state.message)
    this.setState({
      message: ''
    })
  }

  handleKeyPress(e) {
    if(e.keyCode === 13 && e.shiftKey === false) {
      e.preventDefault()
      this.handleEdit(e) // Update state to reflect input value before sending
      this.sendMessageFromInput()
    }
  }

  async handlePaste(e) {
    if (!e.clipboardData) return

    const img = e.clipboardData.files[0]
    if (!img || img.type.indexOf('image') === -1) return

    e.preventDefault()

    // upload the image file
    const client = this.context.pool.activeServer.client
    const imageURL = await client.uploadImage(img)

    console.log(imageURL)
    this.sendMessage(`![](${imageURL})`)
  }

  parseMarkdown(md) {
    const formatted = mrk({
      patterns: {
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

        mention: ({ read, look }, meta) => {
          if (read(1) !== '@') return false

          let username = ''
          let c
          while (c = look()) {
            if (/[a-zA-Z0-9-_]/.test(c) === false) break
            username += read()
          }

          const users = this.context.pool.activeServer.client.users
          const user = users.find(usr => usr.username === username)

          if (!user) return false
          meta({user})

          return true
        },
      },

      htmlify: {
        text({ text }) {
          return text
        },

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
    })(md).html()

    return formatted
  }
}

module.exports = MessageEditor
