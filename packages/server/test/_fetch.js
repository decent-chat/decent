const fetch = require('node-fetch')

const defaults = {
  headers: {
    'Content-Type': 'application/json'
  },
}

module.exports = (port, path = '', opts = {}) =>
  fetch(`http://localhost:${port}/api${path}`, Object.assign({}, defaults, opts))
    .then(res => res.text())
    .then(text => {
      try {
        return JSON.parse(text)
      } catch(err) {
        return {error: {
          code: 'INTERNAL_ERROR',
          stack: new Error('Failed to parse JSON from:\n-----\n' + text + '\n-----')
        }}
      }
    })
    .then(res => {
      if (res.error) {
        if (res.error.code === 'INTERNAL_ERROR') {
          throw Object.assign(new Error('stack:' + res.error.stack), {
            stack: res.error.stack
          })
        } else {
          throw res.error
        }
      }

      return res
    })
