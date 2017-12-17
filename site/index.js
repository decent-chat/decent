'use strict'

// Utility functions:

function post(path, dataObj) {
  return fetch(serverURL.value + '/api/' + path, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dataObj)
  }).then(res => res.json())
}

function get(path, query = {}) {
  const esc = encodeURIComponent
  const queryString = Object.keys(query).length > 0
    ? '?' + Object.keys(query)
      .map(k => esc(k) + '=' + esc(query[k]))
      .join('&')
    : ''

  return fetch(serverURL.value + '/api/' + path + queryString)
    .then(res => res.json())
}

// The actual client code:

const serverDict = new Dictionary()
const activeServerHostname = new Value()
const activeServer = new Reference(serverDict, activeServerHostname)
const activeChannelID = new Value()

const sessionID = new Reference(activeServer, 'sessionID')

const serverURL = new Computed([activeServerHostname], hostname => {
  if (hostname) {
    return '//' + hostname
  } else {
    return null
  }
})

const serverChannels = new Computed([serverURL], async url => {
  if (url) {
    return (await get('channel-list')).channels
  } else {
    return []
  }
})

const sidebarChannelList = oof.mutableList(channel => {
  return oof('a.list-item.list-item-channel', {
    href: '#'
  }, [channel.name])
    .on('click', () => {
      activeChannelID.set(channel.id)
    })
}).mount('#sidebar-channel-list')

serverChannels.onChange(channels => {
  sidebarChannelList.clear()

  for (const channel of channels) {
    sidebarChannelList.append(channel)
  }
})

const messageGroupList = oof.mutableList(messageGroup => {
  const el = oof('.message-group', {}, [
    oof('img.message-group-icon', {
      src: 'https://cdn2.scratch.mit.edu/get_image/user/907223_90x90.png'
    }),
    oof('.message-group-content', {}, [
      oof('.message-group-info', {}, [
        oof('.message-group-name', {}, [messageGroup.authorUsername]),
        oof('time.message-group-date', {}, [messageGroup.date.toString()])
      ]),
      oof('.message-group-messages')
    ])
  ])

  messageGroup.messages.mount(el.querySelector('.message-group-messages'))

  return el
}).mount('#content > .messages')

activeChannelID.onChange(async channelID => {
  messageGroupList.clear()

  const result = await get(`channel/${channelID}/latest-messages`)

  // Cancel if the user changed the selected channel while we were downloading
  // the latest messages.
  if (activeChannelID.value !== channelID) {
    return
  }

  if (result.success !== true) {
    console.warn('Error fetching latest messages:', result)
    return
  }

  // Clear the list again, just in case the user double-clicked, which would
  // cause duplicate messages to show up.
  messageGroupList.clear()

  const { messages } = result

  for (const message of messages) {
    appendMessage(message)
  }
})

function appendMessage(message) {
  const lastGroup = messageGroupList.getLast()
  const shouldAddToLast = lastGroup &&
    lastGroup.authorID === message.authorID &&
    lastGroup.messages.length < 20

  if (shouldAddToLast) {
    lastGroup.messages.append(message)
  } else {
    messageGroupList.append({
      authorID: message.authorID.toString(),
      authorUsername: message.authorUsername.toString(),
      date: new Date(message.date),
      messages: oof.mutableList(message => {
        return oof('.message', {}, [message.text.toString()])
      }, [message])
    })
  }
}

function addServer(serverHostname) {
  serverDict[serverHostname] = new Dictionary({
    sessionID: null
  })

  const socket = ws.connectTo(serverHostname, {
    onMessage: (evt, data) => {
      if (evt !== 'ping for data') {
        console.log('socket:', evt, data)
      }

      if (evt === 'ping for data') {
        socket.send(JSON.stringify({evt: 'pong data', data: {
          sessionID: sessionID.value
        }}))
      }

      if (evt === 'received chat message' && data && data.message) {
        appendMessage(data.message)
      }
    }
  })

  serverDict.socket = socket

  activeServerHostname.set(serverHostname)
}

addServer('localhost:2999')

document.getElementById('login').addEventListener('click', async () => {
  if (activeServer.value === null) {
    alert('Excuse me, you aren\'t on a server???')
  }

  const username = prompt('Username?')
  const password = prompt('Password? (Insert speel about DON\'T SEND SENSITIVE PASSWORDS OVER HTTP here)')

  if (username && password) {
    const result = await post('login', {username, password})

    if (result.success === true) {
      activeServer.value.sessionID = result.sessionID
    }
  }
})

document.querySelector('#content .message-editor-button')
  .addEventListener('click', () => sendMessageFromInput())

const messageInput = document.querySelector('#content .message-editor-input')
messageInput.addEventListener('keydown', evt => {
  if (evt.keyCode === 13) {
    evt.preventDefault()
    sendMessageFromInput()
  }
})

async function sendMessageFromInput() {
  if (sessionID.value === null) {
    alert('Please sign in before sending a message.')
    return
  }

  if (activeChannelID.value === null) {
    alert('Please join a channel before sending a message.')
    return
  }

  const text = messageInput.value

  messageInput.value = ''

  const result = await post('send-message', {
    sessionID: sessionID.value,
    channelID: activeChannelID.value,
    text
  })

  if (result.success !== true) {
    if (confirm(
      'Failed to send message! Recover it?\nError: ' + result.error
    )) {
      messageInput.value = text
    }
  }
}
