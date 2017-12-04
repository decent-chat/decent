import Actor from './Actor.js'
import { get, post } from './api.js'

export function queryByDataset(key, value) {
  return `[data-${key}='${value.replace(/'/g, '\\\'')}']`
}

export default class MessagesActor extends Actor {
  init() {
    this.messagesContainer = document.getElementById('messages')

    this.actors.channels.on('update active channel', async channel => {
      this.clear()

      // Display latest messages in the channel
      const { messages } = await get(`channel/${channel.id}/latest-messages`)
      for (const msg of messages) {
        await this.showMessage(msg)
      }
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
    const form = document.getElementById('form')
    form.addEventListener('submit', async evt => {
      evt.preventDefault()

      if (!this.actors.session.loggedIn) {
        alert('You must be logged in to send a message.')
        return
      }

      if (!this.actors.channels.activeChannelID) {
        alert('You must be in a channel to send a message.')
        return
      }

      const text = chatInput.value

      try {
        chatInput.value = ''

        if (text.trim().length === 0) {
          return
        }

        //const signature = await signText(text)
        const channelID = this.actors.channels.activeChannelID
        const sessionID = this.actors.session.sessionID

        const result = await post('send-message', {
          text,
          //signature,
          channelID,
          sessionID,
        })

        if (result.success) {
          return
        }
      } catch(error) {
        console.error(error)
      }

      const restore = confirm(
        'Your message was NOT sent! Some sort of internal error. See your browser network/console log.\n' +
        'However, its content was saved:\n"""\n' + text + '\n"""\n' +
        'Would you like to restore this into the chat input box?'
      )

      if (restore) {
        chatInput.value = text
      }
    })

    this.socket.on('received chat message', async msg => {
      if (typeof msg !== 'object') {
        return
      }

      await this.showMessage(msg.message)
    })

    this.socket.on('edited chat message', async msg => {
      if (typeof msg !== 'object') {
        return
      }

      await this.showMessageRevision(msg.message)
    })
  }

  clear() {
    for (const el of this.messagesContainer.querySelectorAll('.message-group')) {
      el.remove()
    }
  }

  async showMessage(message) {
    const { revisions, authorID, authorUsername, id: messageID } = message

    if (!revisions || !authorID) {
      return
    }

    if (!revisions.length || !revisions[0].text) {
      return
    }

    const getScrollDist = () => messages.scrollHeight - messages.offsetHeight
    let wasScrolledToBottom = (messages.scrollTop === getScrollDist())

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

      let text
      try {
        text = await this.actors.modals.prompt('Edit message')
      } catch (error) {
        if (error !== 'modal closed') {
          throw error
        }
      }

      const result = await post('edit-message', {
        sessionID: this.actors.session.sessionID,
        text, messageID,
        //signature: await signText(text)
      })
    })
  }

  async showMessageRevision(message, index = undefined) {
    const el = document.getElementById('message-' + message.id)

    if (el) {
      const content = el.querySelector('.message-revision-content')
      if (content) {
        content.remove()
      }
      el.appendChild(await this.buildMessageContent(message, index))
    }
  }

  // Formats some message text. Returns a <span>
  // element ready to be displayed.
  formatMessageText(text) {
    const el = document.createElement('span')
    const { user } = this.actors.session.sessionObj

    let buffer = ''
    let currentToken = 'text'
    let styles = {} // (b)old, (i)talics, (u)nderline, (s)trikethrough
    let esc = false

    const startToken = nextToken => {
      // end the current token
      if (buffer === '') {
        ;
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
        if (buffer === '@') { // TODO: must be a logged-in username!
          // not a mention; treat as text
          el.appendChild(document.createTextNode(buffer))
        } else {
          const mentionEl = document.createElement('span')

          mentionEl.classList.add('message-mention')

          if (buffer === '@' + user.username || buffer === '@everyone')
            mentionEl.classList.add('message-mention-of-user')

          mentionEl.appendChild(document.createTextNode(buffer))
          el.appendChild(mentionEl)
        }
      } else if (currentToken === 'channelref') {
        const channelName = buffer.substr(1)
        const channel = this.actors.channels.getChannelByName(channelName)

        if (!channel) {
          // not an actual channel; treat as text
          el.appendChild(document.createTextNode(buffer))
        } else {
          const refEl = document.createElement('span')

          refEl.classList.add('message-channelref')
          refEl.appendChild(document.createTextNode(buffer))

          // Go to the channel on-click
          refEl.addEventListener('click', evt => {
            evt.preventDefault()
            evt.stopPropagation() // Don't trigger edit message

            this.emit('click on channel reference', channel)
            this.actors.channels.viewChannel(channel.id)

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
        katex.render(buffer, spanEl)

        el.appendChild(spanEl)
      }

      // start next token
      buffer = ''
      currentToken = nextToken
    }

    function toggleStyle(k) {
      if (styles[k] === true) {
        // end style
        startToken('text')
        styles[k] = false
      } else {
        // start style
        startToken('text') // end current token
        styles[k] = true
      }
    }

    for (let c = 0; c < text.length; c++) {
      const char = text[c]
      const charBefore = text[c - 1] || ' '
      const charNext = text[c + 1] || ' '

      if (esc) esc = false
      else {
        if (char === '\\') { esc = true; continue }

        else if (char === '@' && currentToken === 'text' && charBefore === ' ') startToken('mention')
        else if (!(/[a-zA-Z0-9_-]/).test(char) && currentToken === 'mention') startToken('text')

        else if (char === '#' && currentToken === 'text' && charBefore === ' ') startToken('channelref')
        else if (!(/[a-zA-Z0-9_-]/).test(char) && currentToken === 'channelref') startToken('text')

        else if (char === '*' && currentToken === 'text') {
          if (charNext === '*') {
            // bold
            toggleStyle('b')
            c++ // skip charNext
          } else {
            // italic
            toggleStyle('i')
          }

          continue
        }

        else if (char === '_' && currentToken === 'text') {
          if (charNext === '_') {
            // underline
            toggleStyle('u')
            c++ // skip charNext
          } else {
            // italic
            toggleStyle('i_')
          }

          continue
        }

        else if (char === '~' && charNext === '~' && currentToken === 'text') {
          // strikethrough
          toggleStyle('s')
          c++ // skip charNext

          continue
        }

        else if (char === '$' && charNext === '$' && currentToken !== 'latex') { startToken('latex'); c++; continue }
        else if (char === '$' && charNext === '$' && currentToken === 'latex') { startToken('text'); c++; continue }

        else if (char === '`' && currentToken !== 'code') { startToken('code'); continue }
        else if (char === '`' && currentToken === 'code') { startToken('text'); continue }
      }

      buffer += char
    }

    styles = {}
    startToken(null)
    return el
  }

  // Builds the message content elements of a message. If the passed revision index
  // is set to null, or is greater than the number of revisions, the most recent
  // revision is used.
  async buildMessageContent(message, revisionIndex = null) {
    const { authorUsername, date } = message

    if (!(revisionIndex in message.revisions)) {
      revisionIndex = message.revisions.length - 1
    }

    if (revisionIndex < 0) {
      revisionIndex = 0
    }

    const revision = message.revisions[revisionIndex]

    const { text, signature } = revision

    const el = document.createElement('div')
    el.classList.add('message-revision-content')

    const dateObj = new Date(date)
    const pad = value => value.toString().padStart(2, '0')

    const time = document.createElement('time')
    time.setAttribute('datetime', dateObj.toISOString())
    time.appendChild(document.createTextNode(
      `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`
    ))
    el.appendChild(time)

    const contentEl = this.formatMessageText(text)
    contentEl.classList.add('message-content')
    el.appendChild(contentEl)

    if (message.revisions.length > 1) {
      let label
      if (message.revisions.length === 2) {
        label = '(Edited)'
      } else {
        label = `(Edited ${message.revisions.length - 1} times)`
      }

      const a = document.createElement('a')
      a.href = '#'
      a.appendChild(document.createTextNode(label))

      el.appendChild(document.createTextNode(' '))
      el.appendChild(a)

      a.addEventListener('click', async evt => {
        evt.preventDefault()
        evt.stopPropagation()

        const index = prompt('View the version at what index? (Leave blank for the latest.)')

        if (index === null) {
          return
        }

        if (index.trim().length) {
          await showMessageRevision(message, index - 1)
        } else {
          await showMessageRevision(message)
        }
      })
    }

    return el
  }
}
