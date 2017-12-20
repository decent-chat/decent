// thin wrapper around window.history. also serves as a document-wide broadcast bus!

const nanobus = require('nanobus') // not an extra dependency; choo uses this
const history = nanobus() // eventemitter

let oldPathString

Object.assign(history, {
  // push new path
  push(path) {
    window.history.pushState({ path }, '', '/#' + path)
    history.emit('navigate', path.substr(1))
  },

  // replace current path
  replace(path) {
    window.history.replaceState({ path }, '', '/#' + path)
    history.emit('navigate', path.substr(1))
  },

  get pathString() {
    return location.hash.substr(2) || '' // remove "#/" prefix
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
  // looks for changes to /#/:host/:channel
  emitPathChanges(path) {
    const [ newHost, newChannel ] = history.path(path)
    const [ oldHost, oldChannel ] = history.path(oldPathString || '!/!')

    oldPathString = path || history.pathString

    // we use timeout here to let window.location update
    setTimeout(() => {
      // did the host change?
      if (newHost !== oldHost) {
        console.log('host update', newHost || null)
        history.emit('host update', newHost || null)
      }

      // did the channel change? note this may not actually be
      // a channel and may just be 'settings' or something, but
      // for the purpose of routing we'll still call it a 'channel'.
      //
      // note that the 'content' element refers to this as a 'page'.
      if (newChannel !== oldChannel) {
        console.log('page update', newChannel || null)
        history.emit('channel update', newChannel || null)
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
