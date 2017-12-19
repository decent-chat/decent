// thin wrapper around window.history. also serves as a document-wide broadcast bus!

const nanobus = require('nanobus') // not an extra dependency; choo uses this
const history = nanobus() // eventemitter

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
    const path = location.pathname.substr(1)

    return path.split('/') // easy!
  },

  // use emit() to broadcast a document-wide message, like
  // a sessionID change
})

// popstate is emitted when the user hits the back button
// in the browser chrome. i.e. history.go(-1)
window.addEventListener('popstate', () => {
  history.emit('navigate')
})

history.on('*', evt => {
  console.log('history broadcast:', evt)
})

module.exports = history
