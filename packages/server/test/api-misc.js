const { test } = require('ava')
const { testWithServer } = require('./_serverUtil')
const fetch = require('./_fetch')
const { setSetting, serverPropertiesID } = require('../settings')

let portForApiMiscTests = 25000

test('GET /', t => {
  return testWithServer(portForApiMiscTests++, async ({ server, port }) => {
    const response = await fetch(port, '')
    t.deepEqual(Object.keys(response), ['implementation', 'decentVersion', 'useSecureProtocol'])

    t.is(response.implementation, '@decent/server')
    t.is(typeof response.decentVersion, 'string')
    t.is(response.useSecureProtocol, false)

    await setSetting(server.db.settings, serverPropertiesID, 'https', 'on')

    const response2 = await fetch(port, '')
    t.is(response2.useSecureProtocol, true)
  })
})
