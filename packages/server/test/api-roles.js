const { test } = require('ava')
const { testWithServer, makeAdmin } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiRoleTests = 31000

test('POST /api/roles', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID } = await makeAdmin(server, port)

    const response = await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        // sessionID,
        name: 'Emote Manager', permissions: {
          manageEmotes: true
        }
      })
    })

    t.deepEqual(Object.keys(response), ['role'])
    t.deepEqual(Object.keys(response.role), ['id', 'name', 'permissions'])
    t.is(response.role.name, 'Emote Manager')
    t.deepEqual(response.role.permissions, {manageEmotes: true})
  })
})
