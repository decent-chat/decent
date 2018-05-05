const fetch = require('node-fetch')

const defaults = {
  headers: {
    'Content-Type': 'application/json'
  },
}

module.exports = (port, path = '', opts = {}) => {
  if (typeof port !== 'number') {
    throw new TypeError('Passed port is not a number (did you forget to give it as the first argument?')
  }

  return fetch(`http://localhost:${port}/api${path}`, Object.assign({}, defaults, opts))
    .then(res => res.text())
    .then(text => {
      try {
        return JSON.parse(text)
      } catch(err) {
        return {error: {
          code: 'INTERNAL_FETCH_ERROR',
          stack: new Error('Failed to parse JSON from:\n-----\n' + text + '\n-----')
        }}
      }
    })
    .then(res => {
      if (res.error) {
        if (res.error.code === 'INTERNAL_FETCH_ERROR') {
          throw Object.assign(new Error('stack:' + res.error.stack), {
            stack: res.error.stack
          })
        } else {
          throw Object.assign(res.error, {_to: path, _opts: opts})
        }
      }

      return res
    })
}
