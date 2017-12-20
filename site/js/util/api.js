// wrapper around window.fetch

async function fetchHelper(state, path, fetchConfig = {}) {
  // Quick guarding, just in case e.g. host is fetched from a variable
  // whose value is undefined.
  if (!state) throw new Error('No state/host argument given')
  if (!path) throw new Error('No path argument given')

  let secure = false, host = state
  if (typeof state === 'object') {
    secure = state.secure
    host = state.params.host
  }

  const protocol = secure ? 'https://' : '//'
  const result = await fetch(protocol + host + '/api/' + path, fetchConfig)
    .then(res => res.json())

  // if we get an error object, throw
  if (result.error) {
    // { message, data }
    throw Object.assign(new Error(result.error), {
      data: result,
    })
  }

  return result
}

module.exports = {
  get(state, path, query = {}) {
    const esc = encodeURIComponent
    const queryString = Object.keys(query).length > 0
      ? '?' + Object.keys(query)
        .map(k => esc(k) + '=' + esc(query[k]))
        .join('&')
      : ''

    return fetchHelper(state, path + queryString)
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

  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}
