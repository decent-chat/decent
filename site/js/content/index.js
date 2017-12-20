// import choo
const choo = require('choo')
const html = require('choo/html')

// import utils
const history = require('../util/history')
const storage = require('../util/storage')
const { get } = require('../util/api')
const WS = require('../util/ws')

// initialize choo
const content = choo()

// initialize state
content.use((state, emitter) => {
  state.page = null
  state.channel = null
  state.channelName = null
  state.host = null
  state.messages = null
  state.sessionID = null
  state.ws = null
  state.fetchingOlderMessages = false

  let messagesContainer = document.querySelector('.messages')
  const getScrollDist = () => messagesContainer.scrollHeight - messagesContainer.offsetHeight

  function handleNewMessage({ message }) {
    const currentChannel = state.channel

    if (currentChannel && message.channelID === currentChannel.id) {
      messagesContainer = document.querySelector('.messages')
      const wasScrolledToBottom = (messagesContainer.scrollTop > getScrollDist() - 50)

      state.messages.push(message)
      emitter.emit('render')

      // autoscroll after we render if we were scrolled to the bottom beforehand
      if (wasScrolledToBottom)
      setTimeout(() => {
        messagesContainer.scrollTop = getScrollDist()
      }, 25)
    }
  }

  function handleEditMessage({ message }) {
    const currentChannel = state.channel

    if (currentChannel && message.channelID === currentChannel.id) {
      const oldMessage = state.messages.find(msg => msg.id === message.id)

      Object.assign(oldMessage, message)

      emitter.emit('render')
    }
  }

  history.on('session id update', id => {
    state.sessionID = id
    emitter.emit('render')
  })

  history.on('host update', host => {
    state.host = host

    if (state.ws) {
      // remove event listeners from socket
      state.ws.removeListener('recieved chat message', handleNewMessage)
      state.ws.removeListener('edited chat message', handleEditMessage)
    }

    if (host) {
      // establish/use websocket
      state.ws = new WS(host)
      state.ws.on('received chat message', handleNewMessage)
      state.ws.on('edited chat message', handleEditMessage)
    }
  })

  history.on('channel update', async page => {
    if (page && page.startsWith('#')) {
      // a channel page
      state.page = 'channel'
      state.channel = null // loading...
      state.channelName = page.substr(1)
      state.messages = null

      emitter.emit('render')

      // fetch channel list so we can get the ID of the channel we need to load
      const { channels } = await get(state.host, 'channel-list')
      const channel = channels.find(c => c.name === state.channelName)

      if (channel) {
        state.channel = channel

        // fetch latest messages
        const { messages } = await get(state.host, `channel/${channel.id}/latest-messages`)
        state.messages = messages
        state.fetchingOlderMessages = false

        // scroll to bottom afterwards
        setTimeout(() => {
          messagesContainer = document.querySelector('.messages')
          messagesContainer.scrollTop = getScrollDist()
        }, 25)
      } else {
        state.page = 'channel-not-found'
      }
    } else {
      // something else. these have not
      // been implemented yet, but it's
      // probably going to be something
      // like 'settings' or 'permissions'
      // for per-server admin config.
      state.page = page
      state.channel = null
      state.channelName = null
      state.messages = null
    }

    emitter.emit('render')
  })
})

// import sub-elements
const { messageGroup, groupMessages, updateTimes } = require('./message-group')
const messageEditor = require('./message-editor')

setInterval(updateTimes, 60 * 1000) // every minute

// create template
const tmpl = (state, emit) => {
  if (state.page === 'channel') {
    if (state.channel && state.messages !== null) {
      const messageGroups = groupMessages(state.messages)

      return html`<div id='content' class='main'>
        <div class='messages' onscroll=${onscroll}>
          ${messageGroups.map(messageGroup(state, emit))}
        </div>

        ${messageEditor(state, emit)}
      </div>`
    } else {
      // Loading (TODO: make prettier)
      return html`<div id='content' class='main'>
        <h3>Loading +${state.host}#${state.channelName}...</h3>
      </div>`
    }
  } else if (state.page === 'channel-not-found') {
    // Channel not found
    return html`<div id='content' class='main'>
      <h1>Channel not found!</h1>
      <p>
        The channel #${state.channelName} <b>does not exist</b>.
      </p>
    </div>`
  } else if (state.page === null) {
    // Empty page - we're still loading, most likely
    return html`<div id='content' class='main'></div>`
  } else {
    // TODO implement settings page, etc.
    return html`<div id='content' class='main'>
      <h1>Not found!</h1>
      <p>
        The page '${state.page}' doesn't exist.
      </p>
    </div>`
  }

  async function onscroll(evt) {
    if (state.fetchingOlderMessages === true) return

    const messagesEl = document.querySelector('.messages')
    const scrolledToTop = messagesEl.scrollTop < 50
    const beforeMessageID = state.messages[0].id

    if (!scrolledToTop) return

    state.fetchingOlderMessages = true

    // fetch older messages
    const { messages: oldMessages } = await get(state.host, `channel/${state.channel.id}/latest-messages`, {
      before: beforeMessageID,
    })

    if (oldMessages.length) {
      state.messages = [ ...oldMessages, ...state.messages ]
      state.fetchingOlderMessages = false // note we don't set this to true if there are no older messages, since we never need to scrollback again

      emit('render')

      setTimeout(() => {
        const beforeMessageEl = messagesEl.querySelector('#msg-' + beforeMessageID)

        beforeMessageEl.scrollIntoView({ behaviour: 'instant' })
      }, 25)
    }
  }
}

content.route('*', tmpl)
module.exports = content
