import Actor from './Actor.js'
import { get, post } from './api.js'

export function queryByDataset(key, value) {
  return `[data-${key}='${value.replace(/'/g, '\\\'')}']`
}

export default class MessagesActor extends Actor {
  init() {
    this.messagesContainer = document.getElementById('messages')
    this.mostRecentMessageID = null // Used for the [Up -> Edit most recent mesage] binding

    this.actors.channels.on('update active channel', async channel => {
      this.clear()

      // Display latest messages in the channel
      const { messages } = await get(`channel/${channel.id}/latest-messages`, this.actors.session.currentServerURL)
      for (const msg of messages) {
        await this.showMessage(msg)
      }

      this.emit('loaded messages', channel)
    })

    this.actors.session.on('update', (loggedIn, sessionObj) => {
      for (const msg of document.querySelectorAll('.message.created-by-us')) {
        msg.classList.remove('created-by-us')
      }

      if (loggedIn) {
        for (const msg of document.querySelectorAll(queryByDataset('author', sessionObj.user.id))) {
          msg.classList.add('created-by-us')
        }
      }
    })

    const chatInput = document.getElementById('chat-input')

    // Up arrow         -> Edit most recent message
    // Enter [no shift] -> Send
    let shifted = false
    chatInput.addEventListener('keydown', evt => {
      if (evt.keyCode === 16) {
        // Shift
        shifted = true
      } else if (evt.keyCode === 13 && !shifted) {
        // Enter [no shift]
        this.submitFormAction(evt)
      } else if (evt.keyCode === 38) {
        // Up arrow

        // Ignore if the form has been overloaded (e.g. currently editing message)
        if (this.formSubmitOverloadFn) {
          return
        }

        // Only work if the chat input is empty!
        if (chatInput.value.length > 0) {
          return
        }

        this.editMessage(this.mostRecentMessageID)

        evt.preventDefault()
        return false
      }
    })

    chatInput.addEventListener('keyup', evt => {
      // Unshift
      if (evt.keyCode === 16) {
        shifted = false
      }
    })
  }

  bindToSocket(socket) {
    socket.on('received chat message', async msg => {
      if (typeof msg !== 'object') {
        return
      }

      await this.showMessage(msg.message)
    })

    socket.on('edited chat message', async msg => {
      if (typeof msg !== 'object') {
        return
      }

      // Display newly-edited message.
      await this.updateMessageContent(msg.message)
    })
  }

  clear() {
    for (const el of this.messagesContainer.querySelectorAll('.message-group')) {
      el.remove()
    }
  }

  async submitFormAction(evt) {
    if (!this.actors.session.loggedIn) {
      alert('You must be logged in to send a message.')
      return
    }

    if (!this.actors.channels.activeChannelID) {
      alert('You must be in a channel to send a message.')
      return
    }

    const chatInput = document.getElementById('chat-input')
    const text = chatInput.value

    chatInput.value = ''
    evt.preventDefault()

    if (this.formSubmitOverloadFn) {
      this.formSubmitOverloadFn({ evt, text, chatInput })
      this.formSubmitOverloadFn = null

      return
    }

    try {
      if (text.trim().length === 0) {
        return
      }

      const channelID = this.actors.channels.activeChannelID
      const sessionID = this.actors.session.sessionID

      const result = await post('send-message', {
        text,
        channelID,
        sessionID,
      }, this.actors.session.currentServerURL)

      if (result.success) {
        this.mostRecentMessageID = result.messageID

        return
      }
    } catch(error) {
      console.error(error)
    }

    // TODO make better
    const restore = confirm(
      'Your message was NOT sent! Some sort of internal error. See your browser network/console log.\n' +
      'However, its content was saved:\n"""\n' + text + '\n"""\n' +
      'Would you like to restore this into the chat input box?'
    )

    if (restore) {
      chatInput.value = text
    }
  }

  async editMessage(messageID) {
    const messageEl = document.getElementById('message-' + messageID)
    const chatInput = document.getElementById('chat-input')

    if (!messageEl) {
      throw 'Message with ID (' + messageID + ') not loaded'
    }

    messageEl.classList.add('being-edited')
    this.emit('editing message', messageID)

    chatInput.value = messageEl.dataset.source
    chatInput.select()

    return new Promise((resolve, reject) => {
      // Also serves as a cancelEdit() fn.
      const done = didEdit => {
        messageEl.classList.remove('being-edited')
        chatInput.value = ''

        chatInput.removeEventListener('keydown', done)
        resolve(didEdit)

        if (didEdit) {
          this.emit('edited message', messageID)
        } else {
          this.emit('canceled edit', messageID)
        }
      }

      // Esc -> Cancel edit
      chatInput.addEventListener('keydown', evt => {
        if (evt.keyCode === 27) {
          done(false)
        }
      })

      this.formSubmitOverloadFn = async ({ evt, text }) => {
        if (text.trim().length === 0) {
          // TODO Delete message instead!
          done(false)
          alert('Deleting messages isn\'t a thing yet sorry')

          return
        }

        done(true)

        const result = await post('edit-message', {
          sessionID: this.actors.session.sessionID,
          text, messageID
        }, this.actors.session.currentServerURL)

        if (result.success) {
          resolve(true)
        } else {
          reject(result.error)
        }

        evt.preventDefault()
      }
    })
  }

  async showMessage(message) {
    const { authorID, authorUsername, text, id: messageID, channelID } = message

    const getScrollDist = () => messages.scrollHeight - messages.offsetHeight
    let wasScrolledToBottom = (messages.scrollTop > getScrollDist() - 50)

    // We need to have a message group element to actually append the message
    // element to. If the last message group element's author is the author
    // of this current message, we'll reuse it; otherwise, we'll make a new
    // message group.
    let messageGroupEl
    const lastMessageGroupEl = this.messagesContainer.lastChild
    if (lastMessageGroupEl && lastMessageGroupEl.dataset.authorID === authorID) {
      messageGroupEl = lastMessageGroupEl
    } else {
      messageGroupEl = document.createElement('div')
      messageGroupEl.classList.add('message-group')
      messageGroupEl.dataset.authorID = authorID
      this.messagesContainer.appendChild(messageGroupEl)

      const authorEl = document.createElement('div')
      authorEl.classList.add('message-group-author')
      authorEl.appendChild(document.createTextNode(authorUsername))
      messageGroupEl.appendChild(authorEl)

      const messageListEl = document.createElement('div')
      messageListEl.classList.add('messages')
      messageGroupEl.appendChild(messageListEl)
    }

    const el = document.createElement('div')
    el.classList.add('message')
    el.setAttribute('id', 'message-' + messageID)
    el.dataset.author = authorID
    el.dataset.source = text
    el.appendChild(await this.buildMessageContent(message))
    messageGroupEl.querySelector('.messages').appendChild(el)

    if (this.actors.session.isCurrentUser(authorID)) {
      el.classList.add('created-by-us')
    }

    if (wasScrolledToBottom) {
      this.messagesContainer.scrollTop = getScrollDist()
    }

    el.addEventListener('click', async () => {
      // Don't do anything if we don't own this message!
      if (!actors.session.isCurrentUser(authorID)) {
        return
      }

      this.editMessage(messageID)
    })
  }

  async updateMessageContent(message) {
    const el = document.getElementById('message-' + message.id)

    if (el) {
      const content = el.querySelector('.message-content')
      if (content) {
        content.remove()
      }

      el.appendChild(await this.buildMessageContent(message))
    }
  }

  // Formats some message text. Returns a <span>
  // element ready to be displayed.
  async formatMessageText(text) {
    const el = document.createElement('span')
    const { user } = this.actors.session.sessionObj

    let buffer = ''
    let currentToken = 'text'
    let styles = {} // (b)old, (i)talics, (u)nderline, (s)trikethrough
    let esc = false

    text = text.trim()

    const startToken = async nextToken => {
      // End the current token

      const treatAsText = () => el.appendChild(document.createTextNode(buffer))

      if (buffer === '') {
        if (currentToken === 'newline') {
          el.appendChild(document.createElement('br'))
        }
      } else if (currentToken === 'text') {
        const textNode = document.createTextNode(buffer)
        const spanEl = document.createElement('span')
        spanEl.appendChild(textNode)

        // (b)old, (i)talic, etc.
        for (let [ style, enabled ] of Object.entries(styles)) {
          if (style == 'i_') style = 'i'
          if (enabled) spanEl.classList.add('message-format-' + style)
        }

        el.appendChild(spanEl)
      } else if (currentToken === 'mention') {
        if (buffer === '@' || (await get('username-available/' + buffer.substr(1), this.actors.session.currentServerURL)).available) {
          // not a mention; treat as text
          treatAsText()
        } else {
          const mentionEl = document.createElement('span')

          mentionEl.classList.add('message-mention')

          if (user && buffer === '@' + user.username || buffer === '@everyone')
            mentionEl.classList.add('message-mention-of-user')

          mentionEl.appendChild(document.createTextNode(buffer))
          el.appendChild(mentionEl)
        }
      } else if (currentToken === 'channelref') {
        if (buffer.length <= 1) {
          return treatAsText()
        }

        let serverURL = '', channelName = '', part = '?', miniBuffer = ''
        for (const char of buffer) {
          if (char === '+') {
            if (part === '?') {
              part = '+'
            } else {
              // ???
              return treatAsText()
            }
          } else if (char === '#') {
            if (part === '?' || part === '+') {
              serverURL = miniBuffer
              miniBuffer = ''
              part = '#'
            } else {
              // ???
              return treatAsText()
            }
          } else {
            miniBuffer += char
          }
        }

        if (part === '+') {
          serverURL = miniBuffer
        } else if (part === '#') {
          channelName = miniBuffer
        }

        if (serverURL === '' && !this.actors.channels.getChannelByName(channelName)) {
          // not an actual channel; treat as text
          el.appendChild(document.createTextNode(buffer))
        } else {
          const refEl = document.createElement('span')

          refEl.classList.add('message-channelref')
          refEl.appendChild(document.createTextNode(buffer))

          // Go to the channel on-click
          refEl.addEventListener('click', async evt => {
            evt.preventDefault()
            evt.stopPropagation() // Don't trigger edit message

            this.emit('click on channel reference', channelName, serverURL)

            if (serverURL.length > 0) {
              // Go to server first!
              await Promise.all([
                this.actors.session.switchServer(serverURL),         // Actual switch
                this.actors.channels.waitFor('update channel list'), // Channels list update
                this.waitFor('load messages'),                       // Messages loaded in default channel
              ])
            }

            if (channelName) {
              const channel = this.actors.channels.getChannelByName(channelName)
              this.actors.channels.viewChannel(channel.id)
            }

            // TODO pushState

            return false
          })

          el.appendChild(refEl)
        }
      } else if (currentToken === 'code') {
        const codeEl = document.createElement('code')

        codeEl.classList.add('message-inline-code')
        codeEl.appendChild(document.createTextNode(buffer))

        el.appendChild(codeEl)
      } else if (currentToken === 'latex') {
        const spanEl = document.createElement('span')

        spanEl.classList.add('message-latex')

        try {
          katex.render(buffer, spanEl)
        } catch (err) {
          spanEl.classList.add('message-latex-error')
          spanEl.appendChild(document.createTextNode('LaTeX error'))
        }

        el.appendChild(spanEl)
      }

      // start next token
      buffer = ''
      currentToken = nextToken
    }

    async function toggleStyle(k) {
      if (styles[k] === true) {
        // end style
        await startToken('text')
        styles[k] = false
      } else {
        // start style
        await startToken('text') // end current token
        styles[k] = true
      }
    }

    for (let c = 0; c < text.length; c++) {
      const char = text[c]
      const charBefore = text[c - 1] || ' '
      const charNext = text[c + 1] || ' '

      if (esc) {
        esc = false

        if ([ '@', '*', '_', '$', '~', '`', '\n', '\\' ].includes(char)) {
          buffer += char
          continue
        } else {
          // Useless escape -- pretend it wasn't one.
          buffer += '\\'
        }
      }

      if (char === '\\') { esc = true; continue }

      else if (char === '@' && currentToken === 'text' && charBefore === ' ') await startToken('mention')
      else if (!(/[a-zA-Z0-9_-]/).test(char) && currentToken === 'mention') await startToken('text')

      else if (char === '#' && currentToken === 'text' && charBefore === ' ') await startToken('channelref')
      else if (char === '+' && currentToken === 'text' && charBefore === ' ') await startToken('channelref')
      else if (!(/[a-zA-Z0-9\.#_-]/).test(char) && currentToken === 'channelref') await startToken('text')

      else if (char === '*' && currentToken === 'text') {
        if (charNext === '*') {
          // bold
          await toggleStyle('b')
          c++ // skip charNext
        } else {
          // italic
          await toggleStyle('i')
        }

        continue
      }

      else if (char === '_' && currentToken === 'text') {
        if (charNext === '_') {
          // underline
          await toggleStyle('u')
          c++ // skip charNext
        } else {
          // italic
          await toggleStyle('i_')
        }

        continue
      }

      else if (char === '~' && charNext === '~' && currentToken === 'text') {
        // strikethrough
        await toggleStyle('s')
        c++ // skip charNext

        continue
      }

      else if (char === '$' && charNext === '$' && currentToken !== 'latex') { await startToken('latex'); c++; continue }
      else if (char === '$' && charNext === '$' && currentToken === 'latex') { await startToken('text'); c++; continue }

      else if (char === '`' && currentToken !== 'code') { await startToken('code'); continue }
      else if (char === '`' && currentToken === 'code') { await startToken('text'); continue }

      else if (char === '\n' && currentToken !== 'code') {
        const state = currentToken
        await startToken('newline')
        await startToken(state)
      }

      buffer += char
    }

    // Note: the parser will parse incomplete sequences as if they were complete, for
    //       example, (**hello) will output (<b>hello</b>).
    await startToken(null)
    return el
  }

  // Builds the message content elements of a message.
  async buildMessageContent(message) {
    const { authorUsername, text, date, editDate } = message

    const el = document.createElement('div')
    el.classList.add('message-content')

    const dateObj = new Date(date)
    const pad = value => value.toString().padStart(2, '0')

    const time = document.createElement('time')
    time.setAttribute('datetime', dateObj.toISOString())
    time.appendChild(document.createTextNode(
      `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`
    ))
    el.appendChild(time)

    const contentEl = await this.formatMessageText(text)
    contentEl.classList.add('message-content')
    el.appendChild(contentEl)

    if (editDate) {
      const span = document.createElement('span')
      span.classList.add('message-label')
      span.appendChild(document.createTextNode('(Edited)'))
      span.title = 'Edited at ' + new Date(editDate)

      contentEl.appendChild(document.createTextNode(' '))
      contentEl.appendChild(span)
    }

    return el
  }
}
