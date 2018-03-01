// message list component
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
      && group.authorFlair === msg.authorFlair
      && group.messages.length <= 20
      && (msg.date - group.messages[group.messages.length - 1].date) < apart

    if (!useLastGroup) {
      // create a new group for this message
      msg.group = groups.length
      groups.push({
        authorID: msg.authorID,
        authorUsername: msg.authorUsername,
        authorFlair: msg.authorFlair,
        authorAvatarURL: msg.authorAvatarURL,
        messages: [ msg ],
        id: 'msg-group-' + msg.date,
      })
    } else {
      // add this message to the last group
      msg.group = groups.length - 1
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
    scrolledToBeginning: false,

    // same as scrolledToBeginning, but for the end (most recent
    // messages; used for scrollforward)
    scrolledToEnd: false,

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

    // newest message in list
    get newest() {
      if (!state.messages.list) return null

      return state.messages.list[state.messages.list.length - 1] || null
    },

    // this component's element
    get el() {
      return document.querySelector('.MessageList')
    },

    // returns true if we are ~scrolled to the bottom of chat
    isScrolledToBottom() {
      const m = state.messages.el

      if (!m) return true

      const targetY = m.scrollHeight - m.clientHeight
      const currentY = m.scrollTop
      const difference = targetY - currentY

      return difference < 200
    },

    // oldest message-group element
    get oldestGroupEl() {
      return document.querySelector('.MessageGroup:first-child')
    },

    // newest message-group element
    get newestGroupEl() {
      return document.querySelector('.MessageGroup:last-child')
    },

    // scroll to message smoothly
    scrollToMsg({ id }, opts = {}) {
      const el = document.querySelector('#msg-' + id)

      el.scrollIntoView(Object.assign({
        behavior: 'instant',
        block: 'center',
      }, opts))
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
  emitter.on('messages.fetch', async (direction, messageID = null) => {
    if (!['older', 'newer'].includes(direction)) {
      throw new Error('Expected "older" or "newer" for messages.fetch(direction)')
    }

    // no need to fetch more - we've already fetched every
    // message in this channel!
    if (direction === 'older' && state.messages.scrolledToBeginning) return
    if (direction === 'newer' && state.messages.scrolledToEnd) return

    // if we're currently fetching messages, don't try
    // and fetch even more as we'll run into edge cases
    if (state.messages.fetching) return

    // if the server requires authorization and we aren't authorized,
    // we obviously won't get anything back from the server, so don't
    // try to fetch
    if (!state.sessionAuthorized) return

    const { oldest, newest } = state.messages

    if (messageID === null) {
      if (direction === 'older') {
        if (oldest) {
          messageID = oldest.id
        }
      } else {
        if (newest) {
          messageID = newest.id
        }
      }
    }

    state.messages.fetching = true
    emitter.emit('render')

    // fetch messages before the oldest message we have. if we don't have an oldest message (i.e. list.length == 0)
    // then we will just fetch the latest messages via no `before` parameter
    const { messages } = await api.get(state, `channels/${state.params.channel}/messages`,
      messageID === null
      ? {}
      : direction === 'older' ? { before: messageID } : { after: messageID }
    )

    state.messages.fetching = false

    if (messages.length) {
      const { oldestGroupEl: oldestGroupElBefore } = state.messages

      state.messages.handleScroll = false
      state.messages.list = [
        ...(direction === 'older' ? messages : []),
        ...(state.messages.list || []),
        ...(direction === 'newer' ? messages : [])
      ]
      state.messages.groupsCached = groupMessages(state.messages.list)

      // render the new messages!
      emitter.emit('render')

      // note: there is currently no way to run something after the render executes - see choojs/choo#612
      setTimeout(() => {
        // adjust scroll position, but only if fetching older messages
        // (fetching newer messages just means appending messages, which
        // won't have an effect on scroll position)
        if (direction === 'older') {
          if (oldest) {
            // keep relative scroll position after scrollback
            const distance = state.messages.oldestY

            oldestGroupElBefore.scrollIntoView({ behavior: 'instant' })
            state.messages.el.scrollTop -= distance
          } else {
            // scroll to bottom (initial render)
            state.messages.el.scrollTop = state.messages.el.scrollHeight + 999
          }
        }

        state.messages.handleScroll = true

        emitter.emit('messages.fetchcomplete')
      }, 25)
    } else {
      // no past messages means we've scrolled to the beginning, so we set
      // this flag which will stop all this code handling scrollback from
      // happening again (until we move to a different channel)
      if (direction === 'older') {
        state.messages.scrolledToBeginning = true
      } else {
        state.messages.scrolledToEnd = true
      }

      if (!state.messages.list) {
        state.messages.list = []
        state.messages.groupsCached = []
        emitter.emit('render')
      }
    }
  })

  emitter.on('messages.jumptomessage', async messageID => {
    if (state.messages.fetching) return
    if (!state.sessionAuthorized) return

    state.messages.fetching = true

    // hard-coded number of messages to fetch as context
    // if context = 50, at most 25 messages before the jumped message will be gotten,
    // and any remaining (50 - number of older messages) will be the number of messages
    // after the jumped messages to be gotten
    // (this is so that 50 messages will always be loaded in total, even if the message
    // that is jumped back to is very close to the start of the channel, so there are
    // less than 25 messages before that message)
    // (51 messages will actually be fetched; ideally, 25 before and 25 after the
    // message that is jumped to)
    const context = 50

    const messagesAPI = `channels/${state.params.channel}/messages`

    const { messages: oldMessages } = await api.get(
      state, messagesAPI, { before: messageID, limit: context / 2 }
    )

    const { messages: newMessages } = await api.get(
      state, messagesAPI, { after: messageID, limit: context - oldMessages.length }
    )

    const jumpMessage = await api.get(
      state, `message/${messageID}`
    )

    // overwrite the existing messages list - when jumping to a message, it's
    // assumed that the message is old enough that any current scrollback will
    // be irrelevant (also, it would be a pain to try to line up the two loaded
    // chunks of the "timeline")
    state.messages.fetching = false
    state.messages.handleScroll = false
    state.messages.scrolledToBeginning = false
    state.messages.scrolledToEnd = false
    state.messages.list = [...oldMessages, jumpMessage, ...newMessages]
    state.messages.groupsCached = groupMessages(state.messages.list)
    emitter.emit('render')

    setTimeout(() => {
      const jumpMessageEl = document.getElementById('msg-' + messageID)
      jumpMessageEl.scrollIntoView({behavior: 'instant'})
      state.messages.handleScroll = true

      jumpMessageEl.classList.add('jumped-to')
      jumpMessageEl.addEventListener('animationend', evt => {
        if (evt.animationName === 'jumped-message') {
          jumpMessageEl.classList.remove('jumped-to')
        }
      })

      emitter.emit('messages.fetchcomplete')
    }, 155)
  })

  // when the url changes, load the new channel
  // FIXME: don't assume that the channel actually changed
  emitter.on('routeready', () => {
    emitter.emit('messages.reset')

    if (state.params.channel) {
      emitter.emit('messages.fetch', 'older')
    }
  })

  emitter.on('login', () => {
    if (state.serverRequiresAuthorization && state.params.channel) {
      emitter.emit('messages.fetch', 'older')
    }
  })

  // after logging out, consider all messages gone, if the server requires
  // authentication - after all, they wouldn't be visible to somebody just
  // opening the page (while logged out)
  emitter.on('logout', () => {
    if (state.serverRequiresAuthorization && state.params.channel) {
      state.messages.list = []
      state.messages.groupsCached = []
      emitter.emit('render')
    }
  })

  // event: new message
  emitter.on('ws.message/new', ({ message }) => {
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

        let img
        if (img = el.querySelector('.image:last-of-type img')) {
          // if the message has an image in it, wait for the image to load,
          // then scroll down to it
          img.addEventListener('load', () => {
            setTimeout(() => {
              state.messages.scrollToMsg(message)
            }, 25)
          })
        }
      }
    }, 25)
  })

  // event: edit message
  emitter.on('ws.message/edit', ({ message: msg }) => {
    if (msg.channelID !== state.params.channel) return

    // optimization :tada:
    const msgInList = state.messages.list.find(m => m.id === msg.id)
    const msgInGroup = state.messages.groupsCached[msgInList.group].messages.find(m => m.id === msg.id)

    Object.assign(msgInGroup, msg)
    Object.assign(msgInList, msg)

    emitter.emit('render')
  })
}

const component = (state, emit) => {
  const { list: messages, fetching } = state.messages

  const handleScroll = evt => {
    if (!state.messages.handleScroll) return

    // the scroll event happens when the messages container is cleared,
    // too, at which point oldestGroupEl won't be set, so we don't do
    // anything in that case
    if (!state.messages.oldestGroupEl) return

    const y = state.messages.oldestY = state.messages.oldestGroupEl.getBoundingClientRect().y

    // if y is positive, we've scolled above the top group - so we need
    // to fetch older messages and display 'em
    if (y > 0) {
      emit('messages.fetch', 'older')
    }

    // if we are nearly scrolled to the bottom, fetch *newer* messages
    if (evt.target.scrollTop > evt.target.scrollHeight - evt.target.offsetHeight - 25) {
      emit('messages.fetch', 'newer')
    }
  }

  if (state.messages.isScrolledToBottom()) {
    // scroll to bottom after re-render
    setTimeout(() => {
      state.messages.el.scrollTop = state.messages.el.scrollHeight + 999
    }, 50)
  }

  if (messages === null) {
    return html`<div class='MessageList --unloaded'>Messages not loaded.</div>`
  } else {
    const groups = state.messages.groupsCached

    return html`<div class='MessageList --loaded' onscroll=${handleScroll}>
      ${groups.map(group =>
          messageGroup.component(state, emit, group))}
    </div>`
  }
}

module.exports = { store, component }
