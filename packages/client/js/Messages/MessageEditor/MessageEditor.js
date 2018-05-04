const { h, Component } = require('preact')
const mrk = require('mrk.js')
const Modal = require('/Modal')
const Icon = require('/Icon')

class MessageEditor extends Component {
  // TODO autocomplete (emotes, mentions, channelrefs)

  constructor() {
    super()

    this.state = {
      message: '',
      me: null,
      isUploading: false,
      height: 61,
    }
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

    setTimeout(() => {
      if (this.props.content && this.ta) {
        this.updateSize({target: this.ta})
      }

      if (this.props.focus && this.ta) {
        this.ta.focus()
      }
    }, 1)
  }

  componentWillMount() {
    if (this.props.content) this.state.message = this.props.content
  }

  render({ sendMessage, allowUploads = true }, { message, me, isUploading, height, showUploadModal }) {
    if (!me) return <div class='MessageEditor --disabled'><b>Sign in</b> to send messages.</div>

    return <div
      class={isUploading ? 'MessageEditor is-uploading' : 'MessageEditor'}
      style={`--messageEditor-height: ${height}px`}
    >
      <div class='MessageEditor-box'>
        <textarea
          placeholder='Enter a message...'
          class='MessageEditor-box-textarea'
          value={message}
          onKeyDown={this.handleKeyDown}
          onKeyPress={this.handleKeyPress}
          onInput={e => { this.setState({message: e.target.value}); this.updateSize(e) }}
          onPaste={this.handlePaste}
          ref={el => {
            this.ta = el
          }}
        />

        {allowUploads && <div class='MessageEditor-box-action' onClick={this.showUploadModal}>
          <Icon icon='upload'/>
          {showUploadModal && <Modal.Async
            title='Upload an image'
            submit={this.handleUpload}
            onHide={this.hideUploadModal}
          >
            <Modal.Input name='file' label='PNG, GIF, JPG' type='file'/>
            <Modal.Button action='submit'>Upload</Modal.Button>
          </Modal.Async>}
        </div>}
      </div>

      <button
        class='MessageEditor-sendButton'
        onClick={this.sendMessageFromInput}
      >
        Send
      </button>
    </div>
  }

  appendMessage(text) {
    const already = this.state.message

    if (!already || ['\n', ' '].includes(already[already.length - 1])) {
      this.setState({message: already + text})
    } else {
      this.setState({message: already + ' ' + text})
    }
  }

  handleUpload = async ({ file }) => {
    const { client } = this.context.pool.activeServer
    console.log(file)

    const url = await client.uploadImage(file)

    this.appendMessage(`![Image](${url})`)
  }

  showUploadModal = () => this.setState({showUploadModal: true})
  hideUploadModal = () => this.setState({showUploadModal: false})

  handleEdit = e => {
    this.setState({
      message: e.target.value,
    })
  }

  sendMessage = message => {
    if (!message) return

    let messageFormatted = this.parseMarkdown(message)
    this.props.sendMessage(messageFormatted)
  }

  sendMessageFromInput = () => {
    if (this.state.message === '') return false

    this.sendMessage(this.state.message)
    this.setState({
      message: '',
      height: 58,
    })
  }

  handleKeyDown = e => {
    if (e.keyCode === 13 && e.shiftKey === false) {
      e.preventDefault()
      this.handleEdit(e) // Update state to reflect input value before sending
      this.sendMessageFromInput() // Updates size
    }
  }

  handleKeyPress = e => {
    this.updateSize(e)

    if (e.keyCode === 27 && this.props.cancel) {
      this.props.cancel()
    }
  }

  updateSize = e => {
    const ta = e.target

    ta.style.height = '5px'
    const endHeight = ta.scrollHeight + 5
    ta.style.height = ''

    this.setState({height: endHeight})
  }

  handlePaste = async e => {
    if (!e.clipboardData) return

    const img = e.clipboardData.files[0]
    if (!img || img.type.indexOf('image') === -1) return

    e.preventDefault()
    this.setState({isUploading: true})

    try {
      // Upload the image file
      const client = this.context.pool.activeServer.client
      const imageURL = await client.uploadImage(img)

      this.sendMessage(`![Image](${imageURL})`)
    } catch(error) {
      throw error
    } finally {
      this.setState({isUploading: false})
    }
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
