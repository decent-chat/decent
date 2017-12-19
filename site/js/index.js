// import utils
const Ws = require('./util/ws')
const history = require('./util/history')

// import elements
const sidebar = require('./sidebar')

// mount elements
sidebar.mount('#sidebar')

// do routing
history.emitPathChanges()
