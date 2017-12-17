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
      console.log('View channel', channel.id)
    })
}).mount('#sidebar-channel-list')

serverChannels.onChange(channels => {
  sidebarChannelList.clear()

  for (const channel of channels) {
    sidebarChannelList.append(channel)
  }
})

function addServer(serverHostname) {
  serverDict[serverHostname] = new Dictionary({
    sessionID: null
  })

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
