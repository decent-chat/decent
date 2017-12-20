// message list component
const css = require('sheetify')
const html = require('choo/html')
const api = require('../util/api')
const messageGroup = require('./message-group')

// groups messages where:
//  * the messages have the same author
//  * the group has <= 20 messages
//  * the messages are < 30 min apart (TODO configurable by client)
const groupMessages = (msgs, startingGroups = []) => {
  const groups = startingGroups

  // milliseconds between messages (30min)
  const apart = 30 * 60 * 1000 // TODO make this per-user/client via storage

  for (const msg of msgs) {
    const group = groups[groups.length - 1]

    const useLastGroup = typeof group !== 'undefined'
      && group.authorID === msg.authorID
      && group.messages.length <= 20
      && (msg.date - group.messages[group.messages.length - 1].date) < apart

    if (!useLastGroup) {
      // create a new group for this message
      msg.group = groups.length
      groups.push({
        authorID: msg.authorID,
        authorUsername: msg.authorUsername,
        messages: [ msg ],
        id: 'msg-group-' + msg.date,
      })
    } else {
      // add this message to the last group
      msg.group = groups.length
      group.messages.push(msg)
      group.id = 'msg-group-' + msg.date // having an id makes nanomorph go quicker
    }
  }

  return groups
}

const store = (state, emitter) => {
  const reset = () => state.messages = {
    // array of message objects
    list: null,

    // cached array of message groups
    groupsCached: [],

    // are we currently fetching messages?
    fetching: false,

    // true if we've fetched all messages up to the beginning
    // of the channel. used for scrollback
    fetchedAll: false,

    // the oldest message el's y coordinate relative to this component
    // used for scrollback
    oldestY: 0,

    // whether we should handle scroll events or not, which in turn
    // updates oldestY
    handleScroll: true,

    // oldest message in list
    get oldest() {
      if (!state.messages.list) return null

      return state.messages.list[0] || null
    },

    // this component's element
    get el() {
      return document.querySelector('.' + prefix)
    },

    // returns true if we are ~scrolled to the bottom of chat
    isScrolledToBottom() {
      const m = state.messages.el

      const targetY = m.scrollHeight - m.clientHeight
      const currentY = m.scrollTop
      const difference = targetY - currentY

      return difference < 200
    },

    // oldest message-group element
    get oldestGroupEl() {
      return document.querySelector('.' + messageGroup.prefix + ':first-child')
    },

    // newest message-group element
    get newestGroupEl() {
      return document.querySelector('.' + messageGroup.prefix + ':last-child')
    },

    // scroll to message smoothly
    scrollToMsg({ id }, smooth = true) {
      const el = document.querySelector('#msg-' + id)

      el.scrollIntoView({
        behavior: smooth ? 'smooth' : 'instant', // auto?
        block: 'center',
      })
    },
  }

  reset() // setup initial state

  // reset component
  emitter.on('messages.reset', () => {
    reset()
    emitter.emit('render')
  })

  // load more messages from the past - used for scrollback
  // and also initial loading
  emitter.on('messages.fetch', async () => {
    // no need to fetch more - we've already fetched every
    // message in this channel!
    if (state.messages.fetchedAll) return

    // if we're currently fetching messages, don't try
    // and fetch even more as we'll run into edge cases
    if (state.messages.fetching) return

    state.messages.fetching = true
    emitter.emit('render')

    // fetch messages before the oldest message we have. if we don't have an oldest message (i.e. list.length == 0)
    // then we will just fetch the latest messages via no `before` parameter
    const { oldest, oldestGroupEl: oldestGroupElBefore } = state.messages
    const { messages } = await api.get(state, `channel/${state.params.channel}/latest-messages`, oldest ? {
      before: oldest.id,
    } : {})

    if (messages.length) {
      state.messages.fetching = false
      state.messages.handleScroll = false
      state.messages.list = [ ...messages, ...(state.messages.list || []) ]
      state.messages.groupsCached = groupMessages(state.messages.list)

      // render the new messages!
      emitter.emit('render')
      emitter.emit('message.fetchcomplete')

      // note: there is currently no way to run something after the render executes - see choojs/choo#612
      setTimeout(() => {
        if (oldest) {
          // keep relative scroll position after scrollback
          const distance = state.messages.oldestY

          oldestGroupElBefore.scrollIntoView({ behaviour: 'instant' })
          state.messages.el.scrollTop -= distance
        } else {
          // scroll to bottom (initial render)
          state.messages.newestGroupEl.scrollIntoView({ behaviour: 'instant' })
        }

        state.messages.handleScroll = true
      }, 25)
    } else {
      // no past messages means we've scrolled to the beginning, so we set
      // this flag which will stop all this code handling scrollback from
      // happening again (until we move to a different channel)
      state.messages.fetchedAll = true

      if (!state.messages.list) {
        state.messages.list = []
        state.messages.groupsCached = []
        emitter.emit('render')
      }
    }
  })

  // when the url changes, load the new channel
  // FIXME: don't assume that the channel actually changed
  emitter.on('route', () => {
    emitter.emit('messages.reset')

    if (state.params.channel) {
      emitter.emit('messages.fetch')
    }
  })

  // event: new message
  emitter.on('ws.receivedchatmessage', ({ message }) => {
    if (message.channelID !== state.params.channel) return

    const groups = state.messages.groupsCached
    const atBottom = state.messages.isScrolledToBottom()

    state.messages.groupsCached = groupMessages([ message ], groups) // we dont need to re-process the entire message list :tada:
    state.messages.list.push(message)

    emitter.emit('render')

    // scroll new message into view if we were at the bottom beforehand
    setTimeout(() => {
      if (atBottom) {
        const el = state.messages.newestGroupEl

        el.scrollIntoView({
          behavior: 'instant',
          block: 'end',
        })
      }
    }, 25)
  })

  // event: edit message
  // TODO test this
  emitter.on('ws.editedchatmessage', ({ message: msg }) => {
    if (msg.channelID !== state.params.channel) return

    // optimization :tada:
    const msgInList = state.messages.list.find(m => m.id === msg.id)
    const msgInGroup = state.messages.groupsCached[msgInList.group].messages.find(m => m.id === msg.id)

    Object.assign(msgInGroup, msg)
    Object.assign(msgInList, msg)

    emitter.emit('render')
  })
}

const prefix = css('./messages.css')

const component = (state, emit) => {
  const { list: messages, fetching } = state.messages

  const handleScroll = evt => {
    if (!state.messages.handleScroll) return

    const y = state.messages.oldestY = state.messages.oldestGroupEl.getBoundingClientRect().y

    // if y is positive then s c r o l l b a c k
    if (y > 0) {
      emit('messages.fetch')
    }
  }

  if (messages === null) {
    return html`<div class=${prefix}>
      Loading...
    </div>`
  } else {
    const groups = state.messages.groupsCached

    return html`<div class='${prefix} has-messages' onscroll=${handleScroll}>
      ${groups.map(group =>
          messageGroup.component(state, emit, group))}
    </div>`
  }
}

module.exports = { store, component, prefix }
