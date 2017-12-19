// import utils
const Ws = require('./util/ws')
const history = require('./util/history')

// import elements
const sidebar = require('./sidebar')
const content = require('./content')

// mount elements
sidebar.mount('#sidebar')
content.mount('#content')

// do routing
history.emitPathChanges()
