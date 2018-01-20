const html = require('bel')
const raw = require('bel/raw')
const css = require('sheetify')

const Nanocomponent = require('nanocomponent')
const Machine = require('nanostate')
const nonew = require('no-new')

const {
  groupMessages,
  messageOkInGroup,
  createGroupFromMessage
} = require('./group-messages')
const { api } = require('../../util')

class MessagesList extends Nanocomponent {
  constructor (emitter, channelID, position = { top: '', bottom: '' }) {
    super()
    this.emitter = emitter

    this.dirty = false
    this.channel = channelID
    this.messages = []
    this.position = position

    this.machine = Machine('fetching', {
      fetching: { done: 'loaded', error: 'errored', reset: 'unloaded' },
      loaded: { reset: 'unloaded',  },
      errored: { retry: 'fetching' },
    })

    this.machine.on('retry', () => this.refetch())
    this.machine.on('done', () => this.emitter.emit('render'))
    this.machine.on('error', () => this.emitter.emit('render'))

    this.emitter.on('ws:active:message/new', ({ message }) => {
      if (message.channelID === this.channel) {
        this.appendMessage(message)
      }
    })

    this._cache = this.machine.state
    this.update()

    this.refetch()
  }

  createElement () {
    css`
      .messages-list {
        list-style: none;

        word-wrap: break-word;
        overflow-x: hidden;
        overflow-y: auto;

        margin: 0;
        padding: 2em;
      }
    `

    if (this.machine.state === 'fetching') {
      css`
        .messages-list.fetching {
          cursor: default;
               user-select: none;
          -moz-user-select: none;

          color: var(--gray-300);
        }
      `

      return html`
        <ul class='messages-list fetching'>
          Loading...
        </ul>
      `
    }

    if (this.machine.state === 'errored') {
      css`
        .messages-list.errored {
          cursor: default;
               user-select: none;
          -moz-user-select: none;

          color: var(--gray-300);

          p { margin-top: 0; float: left; line-height: 38px }
          button { float: right; cursor: pointer }

          max-width: 300px;
        }
      `

      return html`
        <ul class='messages-list errored'>
          <p>Failed to load messages.</p>

          <button
            class='styled-button gray'
            onclick=${() => this.machine.emit('retry')}
          >
            Retry
          </button>
        </ul>
      `
    }

    if (this.messages.length === 0) {
      css`
        .messages-list.empty {
          cursor: default;
               user-select: none;
          -moz-user-select: none;

          color: var(--gray-300);
        }
      `

      return html`
        <ul class='messages-list empty'>
          There's nothing here. Why not be first?
        </ul>
      `
    }

    // note that most events will trigger mutations of this tree as opposed to
    // full re-renders, so we don't really need to worry about createElement's
    // efficiency. groupMessages, for example, is fairly slow on large datasets!

    return html`
      <ul class='messages-list'>
        ${(this.groups = groupMessages(this.messages)).map(group => {
          css('./message-group.css')

          // TODO markdown & related patches (image scrolling, emotes)

          return html`
            <li class='message-group'>
              <img class='icon' src=${group.authorAvatarURL}/>

              <div class='content'>
                <div class='info'>
                  <span class='username'>
                    ${group.authorUsername}
                  </span>

                  <!-- TODO: time -->
                </div>

                ${group.messages.map(message => {
                  return html`
                    <div class='message' id='message-${message.id}'>
                      ${message.text}
                    </div>
                  `
                })}
              </div>
            </li>
          `
        })}
      </ul>
    `
  }

  get el () { return document.getElementById(this._id) }

  update () {
    const machineStateChanged = this._cacheState !== this.machine.state
    this._cacheState = this.machine.state

    if (this.dirty) {
      this.dirty = false
      return true
    } else {
      return machineStateChanged
    }
  }

  async refetch() {
    this.messages = []
    this.emitter.emit('render')

    return this.fetch(0)
      .then(() => this.machine.emit('done'))
      .catch(err => { console.error(err); this.machine.emit('error') })
  }

  // Fetches messages;
  // direction =
  //    1 (older)
  //    0 (initial)
  //   -1 (newer)
  async fetch(direction) {
    let params = {}
    if (direction === 1) {
      // older
      params = { before: this.position.top }
    } else if (direction === -1) {
      // newer
      params = { after: this.position.bottom }
    }

    const { messages } = await api.get(`channel/${this.channel}/latest-messages`, params)

    if (direction === 1) {
      this.messages = [ ...messages, ...this.messages ]
      this.position.top = messages[0].id
    } else if (direction === -1) {
      this.messages = [ ...this.messages, ...messages ]
      this.position.bottom = messages[messages.length - 1].id
    } else {
      this.messages = messages
      this.position = {
        top: messages[0].id,
        bottom: messages[messages.length - 1].id
      }
    }

    return messages
  }

  appendMessage(message) {
    this.messages.push(message)
    this.position.bottom = message.id

    // TODO: centralize createMessageEl and friends, especially when it gets more complex
    const messageEl = html`
      <div class='message' id='message-${message.id}'>
        ${message.text}
      </div>
    `

    const finalGroup = this.groups[this.groups.length - 1]

    if (messageOkInGroup(message, finalGroup)) {
      const groupEl = this.el.querySelector('.message-group:last-child')

      // append to last group
      finalGroup.messages.push(message)
      if (groupEl) groupEl.querySelector('.content').appendChild(messageEl)
    } else {
      // create a new group for this message
      const group = createGroupFromMessage(message)

      this.groups.push(group)

      if (this.el) {
        const groupEl = html`
          <li class='message-group'>
            <img class='icon' src=${group.authorAvatarURL}/>

            <div class='content'>
              <div class='info'>
                <span class='username'>
                  ${group.authorUsername}
                </span>

                <!-- TODO: time -->
              </div>

              <div class='message' id='message-${message.id}'>
                ${message.text}
              </div>
            </div>
          </li>
        `

        this.el.appendChild(groupEl)
      }
    }
  }
}

module.exports = nonew(MessagesList)
