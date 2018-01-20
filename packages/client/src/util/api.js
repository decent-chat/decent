// wrapper around window.fetch. also handles its own hostname & session state.

let host = undefined
let session = null
let secure = null

async function fetchHelper (path, fetchConfig = {}) {
  if (!path) throw new Error('No path argument given')
  if (!host) throw new Error('No host set for api')

  if (session) {
    Object.assign(fetchConfig, {
      headers: {
        'X-Session-ID': session.id
      }
    })
  }

  const protocol = secure ? 'https://' : '//'

  const result = await window.fetch(protocol + host + '/api/' + path, fetchConfig)
    .then(res => res.json())

  // if we get an error object, throw
  if (result.error) {
    // { message, data }
    throw Object.assign(new Error(result.error + ` (to path ${path})`), {
      data: result
    })
  }

  return result
}

module.exports = {
  setSecure (useSecure) {
    console.log('util/api: secure: ', useSecure)
    secure = useSecure
  },

  setHost (newHost) {
    console.log('util/api: switched host to', newHost)
    host = newHost
  },

  setSession (id, user) {
    console.log('util/api: authenticated as', user)
    session = { id, user }
  },

  clearSession (id, user) {
    console.log('util/api: session cleared')
    session = null
  },

  get secureKnown () { return secure !== null },
  get secure () { return !!secure },
  get session () { return session },
  get host () { return host },

  get (path, query = {}) {
    const esc = encodeURIComponent
    const queryString = Object.keys(query).length > 0
      ? '?' + Object.keys(query)
        .map(k => esc(k) + '=' + esc(query[k]))
        .join('&')
      : ''

    return fetchHelper(path + queryString)
  },

  post (path, data = {}) {
    return fetchHelper(path, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
  },

  postRaw (path, body) {
    if (!body) return Promise.reject(new Error('Body not provided'))

    return fetchHelper(path, {
      method: 'post',
      body
    })
  },

  sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
}
