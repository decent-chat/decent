// wrapper around window.fetch

async function fetchHelper(host, path, fetchConfig = {}) {
  // Quick guarding, just in case e.g. host is fetched from a variable
  // whose value is undefined.
  if (!host) throw new Error('No host argument given')
  if (!path) throw new Error('No path argument given')

  const result = await fetch('//' + host + '/api/' + path, fetchConfig)
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
  get(host, path, query = {}) {
    const esc = encodeURIComponent
    const queryString = Object.keys(query).length > 0
      ? '?' + Object.keys(query)
        .map(k => esc(k) + '=' + esc(query[k]))
        .join('&')
      : ''

    return fetchHelper(host, path + queryString)
  },

  post(host, path, data = {}) {
    return fetchHelper(host, path, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
  },

  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}
