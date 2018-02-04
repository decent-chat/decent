const fetch = require('node-fetch')

const defaults = {
  headers: {
    'Content-Type': 'application/json'
  },
}

module.exports = (port, path = '', opts = {}) =>
  fetch(`http://localhost:${port}/api${path}`, Object.assign({}, defaults, opts))
    .then(res => res.json())
    .then(res => res.error ? Promise.reject(res.error) : res)
