const { fetch } = require('fetch-ponyfill')()
const typeforce = require('typeforce')

module.exports = (host, path, opts = {}) => {
  typeforce('Object', host)
  typeforce('String', path)
  typeforce('Object', opts)

  const protocol = host.useSecure ? 'https' : 'http'

  opts.headers = opts.headers || {}
  if (!opts.headers['X-Session-ID'] && host.sessionID) {
    opts.headers['X-Session-ID'] = host.sessionID
  }

  if (opts.body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
  }

  return fetch(`${protocol}://${host.hostname}${path}`, opts)
    .then(response => response.json())
    .then(response => {
      if (response.error
          && response.error.code === 'INCOMPLETE_PARAMETERS'
          && response.error.missing === 'sessionID') {
        const error = new Error('Not logged in')

        error.name = 'NotLoggedInError'

        return Promise.reject(error)
      } else if (response.error
                 && response.error.code === 'MUST_BE_ADMIN') {
        const error = new Error('You must be an admin to do this')

        error.name = 'NoPermissionError'

        return Promise.reject(error)
      } else if (response.error) {
        const error = new Error(response.error.message)

        error.name = 'DecentError'
        error.code = response.error.code

        return Promise.reject(error)
      }

      return Promise.resolve(response)
    })
}
