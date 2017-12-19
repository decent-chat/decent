// thin wrapper around window.history. also serves as a document-wide broadcast bus!

const nanobus = require('nanobus') // not an extra dependency; choo uses this
const history = nanobus() // eventemitter

let oldPath = [ null, null ]

Object.assign(history, {
  // push new path
  push(url) {
    window.history.pushState({}, '', url)
    history.emit('navigate')
  },

  // replace current path
  replace(url) {
    window.history.replaceState({}, '', url)
    history.emit('navigate')
  },

  // parse current path
  path() {
    const path = (location.pathname + location.hash).substr(1)

    return path.split('/') // easy!
  },

  // emit more high-level events than just 'navigate'
  emitPathChanges() {
    const newPath = history.path()

    const [ newHost, newChannel ] = newPath
    const [ oldHost, oldChannel ] = oldPath

    if (newHost !== oldHost) history.emit('host update', newHost)
    if (newChannel !== oldChannel) history.emit('channel update', newChannel)

    oldPath = newPath
  },

  // use emit() to broadcast a document-wide message, like
  // a sessionID change
})

history.on('navigate', history.emitPathChanges)

// popstate is emitted when the user hits the back button
// in the browser chrome. i.e. history.go(-1)
window.addEventListener('popstate', () => {
  history.emit('navigate')
})

module.exports = history
