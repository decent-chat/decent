// wrapper around window.fetch

async function fetchHelper(state, path, fetchConfig = {}) {
  // Quick guarding, just in case e.g. host is fetched from a variable
  // whose value is undefined.
  if (!state) throw new Error('No state argument given')
  if (!path) throw new Error('No path argument given')

  // Let '/' be passed to target the root path (/api).
  if (path === '/') path = ''

  let secure = false, host = state
  if (typeof state === 'object') {
    secure = state.secure
    host = state.params.host
  } else {
    console.warn('Host string provided, not state object')
    console.trace()
  }

  if (state.session.id) {
    fetchConfig.headers = fetchConfig.headers || {}
    fetchConfig.headers['X-Session-ID'] = state.session.id
  }

  const protocol = secure ? 'https://' : '//'
  const endURL = protocol + host + '/api/' + path
  const result = await fetch(endURL, fetchConfig)
    .then(res => res.json())

  // if we get an error object, throw
  if (result.error) {
    // { message, data }

    /*
    console.log('error ---- ' + result.error.code)
    console.log('fetch config:', fetchConfig)
    console.log('sessionid:', state.session.id)
    console.log('path:', path)
    */

    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
      data: result,
      requestPath: path,
      requestFetchConfig: fetchConfig,
      requestEndURL: endURL
    })
  }

  return result
}

function generateQueryString(query) {
  const esc = encodeURIComponent
  return Object.keys(query).length > 0
    ? '?' + Object.keys(query)
      .map(k => esc(k) + '=' + esc(query[k]))
      .join('&')
    : ''
}

module.exports = {
  get(state, path, query = {}) {
    return fetchHelper(state, path + generateQueryString(query))
  },

  delete(state, path, query = {}) {
    // DELETE takes a query string, not a body (so, no "POST" data).
    return fetchHelper(state, path + generateQueryString(query), {
      method: 'delete'
    })
  },

  post(state, path, data = {}) {
    return fetchHelper(state, path, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
  },

  patch(state, path, data = {}) {
    return fetchHelper(state, path, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
  },

  delete(state, path, data = {}) {
    return fetchHelper(state, path, {
      method: 'DELETE',
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
      body
    })
  },

  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}
