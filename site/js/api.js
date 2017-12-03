export function post(path, dataObj) {
  return fetch('/api/' + path, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dataObj)
  }).then(res => res.json())
}

export function get(path) {
  return fetch('/api/' + path, {
    method: 'get',
    headers: {
      'Content-Type': 'application/json'
    },
  }).then(res => res.json())
}
