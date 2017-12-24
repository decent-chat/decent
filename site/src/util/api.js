// wrapper around window.fetch

async function fetchHelper(state, path, fetchConfig = {}) {
  // Quick guarding, just in case e.g. host is fetched from a variable
  // whose value is undefined.
  if (!state) throw new Error('No state argument given')
  if (!path) throw new Error('No path argument given')

  let secure = false, host = state
  if (typeof state === 'object') {
    secure = state.secure
    host = state.params.host
  } else {
    console.warn('Host string provided, not state object')
    console.trace()
  }

  const protocol = secure ? 'https://' : '//'
  const result = await fetch(protocol + host + '/api/' + path, fetchConfig)
    .then(res => res.json())

  // if we get an error object, throw
  if (result.error) {
    // { message, data }
    throw Object.assign(new Error(result.error + ` (to path ${path})`), {
      data: result,
    })
  }

  return result
}

module.exports = {
  get(state, path, query = {}) {
    // Set the session ID if it's set on the state, but only if not already
    // set by the passed query.
    if (state.session && !query.sessionID) {
      query.sessionID = state.session.id
    }

    const esc = encodeURIComponent
    const queryString = Object.keys(query).length > 0
      ? '?' + Object.keys(query)
        .map(k => esc(k) + '=' + esc(query[k]))
        .join('&')
      : ''

    return fetchHelper(state, path + queryString)
  },

  post(state, path, data = {}) {
    // As with get, set the session ID if it's on the state and issing
    // from the data object.
    if (state.session && !data.sessionID) {
      data.sessionID = state.session.id
    }

    return fetchHelper(state, path, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
  },

  postRaw(state, path, body) {
    if (!body) return Promise.reject(new Error('Body not provided'))

    return fetchHelper(state, path, {
      method: 'post',
      body,
    })
  },

  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}
