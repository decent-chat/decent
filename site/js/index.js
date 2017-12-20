// import utils
const Ws = require('./util/ws')
const history = require('./util/history')
const storage = require('./util/storage')
const api = require('./util/api')

// import elements
const sidebar = require('./sidebar')
const content = require('./content')

// mount elements
sidebar.mount('#sidebar')
content.mount('#content')

// publish these, for debugging/experimenting
Object.assign(window, {
  Ws, history, storage, api,
  sidebar, content
})

// do routing
history.emitPathChanges()
