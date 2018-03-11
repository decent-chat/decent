const { test } = require('ava')
const { testWithServer, makeUserWithPermissions } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiSettingTests = 32000

test('GET/PATCH /api/settings', t => {
  return testWithServer(portForApiSettingTests++, async ({ server, port }) => {
    const { sessionID: setterSID } = await makeUserWithPermissions(server, port, {manageServer: true})

    const response = await fetch(port, '/settings')
    t.deepEqual(Object.keys(response), ['settings'])
    t.is(typeof response.settings, 'object')

    const response2 = await fetch(port, '/settings?sessionID=' + setterSID, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Memeland'
      })
    })
    t.deepEqual(response2, {})

    const response3 = await fetch(port, '/settings')
    t.is(response3.settings.name, 'Memeland')

    try {
      const { sessionID: userSID } = await makeUserWithPermissions(server, port, {manageServer: false})
      await fetch(port, '/settings?sessionID=' + userSID, {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Gooey Funtimes'
        })
      })
      t.fail('Could set settings without manageServer permission')
    } catch (error) {
      t.is(error.code, 'MISSING_PERMISSION')
      t.is(error.permission, 'manageServer')
    }

    const response4 = await fetch(port, '/settings?sessionID=' + setterSID, {
      method: 'PATCH',
      body: JSON.stringify({
        name: ''
      })
    })

    t.deepEqual(Object.keys(response4), ['setErrors'])
    t.deepEqual(Object.keys(response4.setErrors), ['name'])
    t.is(typeof response4.setErrors.name, 'string')
  })
})
