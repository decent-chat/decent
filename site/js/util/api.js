// wrapper around window.fetch

async function fetchHelper(host, path, fetchConfig = {}) {
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
  }
}
