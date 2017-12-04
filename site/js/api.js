// These functions assume that serverURL is running
// on standard HTTP - this will likely change in the
// future (e.g. Service Workers only work on https).
//
// Note that WebSockets use their own protocols:
//   http  <--> ws
//   https <--> wss

export function post(path, dataObj, serverURL) {
  return fetch('http://' + serverURL + '/api/' + path, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dataObj)
  }).then(res => res.json())
}

export function get(path, serverURL) {
  return fetch('http://' + serverURL + '/api/' + path, {
    method: 'get',
    headers: {
      'Content-Type': 'application/json'
    },
  }).then(res => res.json())
}
