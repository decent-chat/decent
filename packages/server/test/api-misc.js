const { test } = require('ava')
const { testWithServer } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiMiscTests = 25000

test('/get', t => {
  return testWithServer(portForApiMiscTests++, async ({ port }) => {
    const response = await fetch(port, '')
    t.deepEqual(Object.keys(response), ['decentVersion'])
    t.is(typeof response.decentVersion, 'string')
  })
})
