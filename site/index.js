'use strict'

// Utility functions //////////////////////////////////////////////////////////

async function fetchHelper(path, fetchConfig = {}) {
  if (!serverURL.value) {
    throw new Error({
      error: 'client error - server URL not specified yet'
    })
  }

  const base = serverURL.value

  const result =
    await fetch(base + '/api/' + path, fetchConfig)
    .then(res => res.json())

  // There's no way we can gracefully stop the above caller, so
  // we'll just throw an error.
  if (serverURL.value !== base) {
    const error = 'client error - changed server while fetching'
    throw Object.assign(
      new Error(error + ' ' + path),
      {data: {error, path}})
  }

  if (result.error) {
    throw Object.assign(
      new Error(result.error),
      {data: result})
  }

  return result
}

function post(path, dataObj) {
  return fetchHelper(path, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dataObj)
  })
}

function get(path, query = {}) {
  const esc = encodeURIComponent
  const queryString = Object.keys(query).length > 0
    ? '?' + Object.keys(query)
      .map(k => esc(k) + '=' + esc(query[k]))
      .join('&')
    : ''

  return fetchHelper(path + queryString)
}

// General client state ///////////////////////////////////////////////////////

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

const sessionUser = new Computed([sessionID], async sid => {
  if (sid === null) {
    return null
  }

  const result = await get('session/' + sid)

  // Don't set the session user if we changed to a different user while
  // downloading the session data!
  if (sessionID.value !== sid) {
    return sessionUser.value
  }

  return result.user
})

const sessionUsername = new Computed([sessionUser], user => {
  return user && user.username
})

// WebSocket event handling and setup /////////////////////////////////////////

function addServer(serverHostname) {
  if (Object.keys(serverDict).includes(serverHostname) === false) {
    serverDict[serverHostname] = new Dictionary({
      sessionID: null
    })

    serverList.append({hostname: serverHostname})

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

        if (evt === 'created new channel' && data && data.channel) {
          sidebarChannelList.append(data.channel)
        }
      }
    })

    serverDict[serverHostname].socket = socket
  }

  activeServerHostname.set(serverHostname)
}

// Session user info //////////////////////////////////////////////////////////

const sidebar = document.querySelector('#server-sidebar')

oof.mutable(name => name, sessionUsername)
  .mount('.user-info-name')

sessionUser.onChange(user => {
  if (user) {
    sidebar.classList.add('is-logged-in')
    sidebar.classList.remove('is-logged-out')

    if (user.permissionLevel === 'admin') {
      sidebar.classList.add('is-admin')
    } else {
      sidebar.classList.remove('is-admin')
    }
  } else {
    sidebar.classList.add('is-logged-out')
    sidebar.classList.remove('is-logged-in')
    sidebar.classList.remove('is-admin')
  }
})

// Channel list, add channel //////////////////////////////////////////////////

const sidebarChannelList = oof.mutableList(channel => {
  return oof('a.list-item.list-item-channel', {
    href: '#'
  }, [channel.name])
    .on('click', () => {
      activeChannelID.set(channel.id)
    })
}).mount('#sidebar-channel-list')

serverURL.onChange(async url => {
  let channels
  if (url) {
    channels = (await get('channel-list')).channels
  } else {
    channels = []
  }

  sidebarChannelList.clear()

  for (const channel of channels) {
    sidebarChannelList.append(channel)
  }
})

document.getElementById('create-channel').addEventListener('click', async () => {
  if (!sessionUser.value || sessionUser.value.permissionLevel !== 'admin') {
    alert('You must be a server admin to create a channel.')
    return
  }

  const name = prompt('Channel name?')

  if (name) {
    await post('create-channel', {
      name, sessionID: sessionID.value
    })
  }
})

// Server list, add server ////////////////////////////////////////////////////

oof.mutable(host => host, activeServerHostname)
  .mount(document.querySelector('.server-dropdown-current'))

const serverDropdown = document.querySelector('.server-dropdown')
serverDropdown.addEventListener('click', () => {
  serverDropdown.classList.toggle('open')
})

const serverList = oof.mutableList(server => {
  return oof('.server-dropdown-option', {}, [server.hostname])
    .on('click', () => {
      activeServerHostname.set(server.hostname)
    })
}).mount(serverDropdown.querySelector('.server-dropdown-panel'))

serverList.clear()

document.getElementById('add-server').addEventListener('click', () => {
  const host = prompt('Host URL?')

  if (host) {
    addServer(host)
  }
})

// Message groups /////////////////////////////////////////////////////////////

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

// Sending messages ///////////////////////////////////////////////////////////

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
  if (!sessionID.value) {
    alert('Please sign in before sending a message.')
    return
  }

  if (!activeChannelID.value) {
    alert('Please join a channel before sending a message.')
    return
  }

  const text = messageInput.value

  messageInput.value = ''

  try {
    await post('send-message', {
      sessionID: sessionID.value,
      channelID: activeChannelID.value,
      text
    })
  } catch(error) {
    if (confirm(
      'Failed to send message! Recover it?\nError: ' + error.message
    )) {
      messageInput.value = text
    }
  }
}

// Login, logout, register ////////////////////////////////////////////////////

document.getElementById('login').addEventListener('click', async () => {
  if (!activeServer.value) {
    alert('Please select a server before logging in.')
    return
  }

  const username = prompt('Username?')
  const password = prompt('Password? (Insert speel about DON\'T SEND SENSITIVE PASSWORDS OVER HTTP here)')

  if (username && password) {
    try {
      await post('login', {username, password})
      activeServer.value.sessionID = result.sessionID
    } catch (error) {
      alert('Error logging in: ' + error.message)
    }
  }
})

document.getElementById('logout').addEventListener('click', async () => {
  if (!activeServer.value || !sessionID.value) {
    return
  }

  activeServer.value.sessionID = null
})

document.getElementById('register').addEventListener('click', async () => {
  if (!activeServer.value) {
    alert('Please select a server before registering.')
    return
  }

  const username = prompt('Username?')
  const password = prompt('Password? (PLEASE be careful not to use a sensitive password if you are on an HTTP connection.)')

  if (username && password) {
    try {
      const result = await post('register', {username, password})
      alert(`Account ${username} successfully registered! Please click on the login button.`)
    } catch (error) {
      alert('Error registering: ' + error.message)
    }
  }
})

// Final initialization ///////////////////////////////////////////////////////

if (!location.hostname.endsWith('.github.io')) {
  addServer(location.host) // .host includes the port!
}
