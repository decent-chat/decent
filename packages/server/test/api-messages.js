const { test } = require('ava')
const { makeChannel, makeUser, testWithServer } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiMessageTests = 26000

test('POST /api/messages', t => {
  return testWithServer(portForApiMessageTests++, async ({ server, port }) => {
    const { channelID } = await makeChannel(server, port)
    const { sessionID } = await makeUser(server, port)

    const response = await fetch(port, '/messages', {
      method: 'POST',
      body: JSON.stringify({
        channelID, sessionID,
        text: 'Hello, world!'
      })
    })

    t.deepEqual(Object.keys(response), ['messageID'])
    t.is(typeof response.messageID, 'string')

    try {
      await fetch(port, '/messages/', {
        method: 'POST',
        body: JSON.stringify({
          channelID, text: 'Hello, world!'
        })
      })
      t.fail('Could post without passing session ID')
    } catch (error) {
      t.is(error.code, 'INCOMPLETE_PARAMETERS')
      t.is(error.missing, 'sessionID')
    }
  })
})
