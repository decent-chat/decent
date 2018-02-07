const { test } = require('ava')
const { testWithServer, makeAdmin } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiEmoteTests = 27000

test('POST /api/emotes', t => {
  return testWithServer(portForApiEmoteTests++, async ({ server, port }) => {
    const { sessionID } = await makeAdmin(server, port)
    t.is(await server.db.emotes.count({}), 0)
    await fetch(port, '/emotes', {
      method: 'POST',
      body: JSON.stringify({
        shortcode: 'shipit',
        imageURL: '/img/shipit.png',
        sessionID
      })
    })
    t.is(await server.db.emotes.count({}), 1)
  })
})
