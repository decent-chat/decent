// thin wrapper around window.history. also serves as a document-wide broadcast bus!

const nanobus = require('nanobus') // not an extra dependency; choo uses this
const history = nanobus() // eventemitter

let oldPathString

Object.assign(history, {
  // push new path
  push(path) {
    window.history.pushState({ path }, '', path)
    history.emit('navigate', path.substr(1))
  },

  // replace current path
  replace(path) {
    window.history.replaceState({ path }, '', path)
    history.emit('navigate', path.substr(1))
  },

  get pathString() {
    return (location.pathname + location.hash).substr(1)
  },

  // parse current path
  path(p) {
    const path = p || history.pathString

    return path.split('/') // easy!
  },

  // use go(-1) to go back
  go(n) {
    window.history.go(n)
  },

  // emit more high-level events than just 'navigate'
  // looks for changes to /:host/:channel
  emitPathChanges(path) {
    const [ newHost, newChannel ] = history.path(path)
    const [ oldHost, oldChannel ] = history.path(oldPathString || Math.random().toString())

    oldPathString = path || history.pathString

    // we use timeout here to let window.location update
    setTimeout(() => {
      // did the host change?
      if (newHost !== oldHost) {
        history.emit('host update', newHost)
      }

      // did the channel change? note this may not actually be
      // a channel and may just be 'settings' or something, but
      // for the purpose of routing we'll still call it a 'channel'
      if (newChannel !== oldChannel) {
        history.emit('channel update', newChannel)
      }
    }, 25)
  },

  // use emit() to broadcast a document-wide message, like
  // a sessionID change
})

history.on('navigate', history.emitPathChanges)

// popstate is emitted when the user hits the back button
// in the browser chrome. i.e. history.go(-1)
window.addEventListener('popstate', event => {
  history.emit('navigate', event.state.path.substr(1))
})

module.exports = history
