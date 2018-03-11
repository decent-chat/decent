const { test } = require('ava')
const { testWithServer, makeOwner, makeUser } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiRoleTests = 31000

test('POST /api/roles', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID } = await makeOwner(server, port)

    const response = await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        sessionID,
        name: 'Emote Manager', permissions: {
          manageEmotes: true
        }
      })
    })

    t.deepEqual(Object.keys(response), ['role'])
    t.deepEqual(Object.keys(response.role), ['id', 'name', 'permissions'])
    t.is(response.role.name, 'Emote Manager')
    t.deepEqual(response.role.permissions, {manageEmotes: true})

    try {
      await fetch(port, '/roles', {
        method: 'POST',
        body: JSON.stringify({
          sessionID,
          name: 'Role'
        })
      })
      t.fail('Could create a role without a permissions field')
    } catch (error) {
      t.is(error.code, 'INCOMPLETE_PARAMETERS')
    }

    // You SHOULD be able to do this!
    try {
      await fetch(port, '/roles', {
        method: 'POST',
        body: JSON.stringify({
          sessionID,
          name: 'Role', permissions: {}
        })
      })
    } catch (error) {
      t.fail('Could not create a role with empty permissions')
    }

    try {
      await fetch(port, '/roles', {
        method: 'POST',
        body: JSON.stringify({
          sessionID,
          permissions: {}
        })
      })
      t.fail('Could not create a role without a name field')
    } catch (error) {
      t.is(error.code, 'INCOMPLETE_PARAMETERS')
    }

    // TODO: Tests for creating a role with the same name as an existing role.
  })
})

test('GET /api/roles (default roles)', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const response = await fetch(port, '/roles')

    t.deepEqual(Object.keys(response), ['roles'])

    t.is(response.roles.length, 4)
    t.true(response.roles.some(r => r.id === '_everyone'))
    t.true(response.roles.some(r => r.id === '_user'))
    t.true(response.roles.some(r => r.id === '_guest'))
    t.true(response.roles.some(r => r.name === 'Owner'))
  })
})

test('GET /api/roles/:id', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const response = await fetch(port, '/roles/_everyone')
    t.deepEqual(Object.keys(response), ['role'])
    t.is(response.role.id, '_everyone')

    try {
      await fetch(port, '/roles/abcd')
      t.fail('Could fetch role that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }
  })
})

test('GET /api/roles (with new role)', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID } = await makeOwner(server, port)

    await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        sessionID,
        name: 'Basic Bot', permissions: {
          readMessages: true,
          sendMessages: true
        }
      })
    })

    const response = await fetch(port, '/roles')
    t.is(response.roles.length, 5)

    const botRole = response.roles.find(r => r.name === 'Basic Bot')
    t.truthy(botRole)
    t.is(botRole.name, 'Basic Bot')
    t.deepEqual(botRole.permissions, {readMessages: true, sendMessages: true})
  })
})

test('PATCH /api/roles/:id', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID } = await makeOwner(server, port)

    const response = await fetch(port, '/roles/_user', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Memerz',
        permissions: {uploadImages: true}
      })
    })

    t.deepEqual(response, {})

    const { role: updatedRole } = await fetch(port, '/roles/_user')

    // TODO: Tests for patching the _guest and _everyone roles, which shouldn't
    // ever be allowed to send messages or do anything specific to their own
    // self.

    try {
      await fetch(port, '/roles/_guest', {
        method: 'PATCH',
        body: JSON.stringify({permissions: {sendMessages: true}})
      })
      t.fail('Could set non-guest permission on _guest')
    } catch (error) {
      t.is(error.code, 'NOT_GUEST_PERMISSION')
    }

    try {
      await fetch(port, '/roles/_everyone', {
        method: 'PATCH',
        body: JSON.stringify({permissions: {sendMessages: true}})
      })
      t.fail('Could set non-guest permission on _everyone')
    } catch (error) {
      t.is(error.code, 'NOT_GUEST_PERMISSION')
    }

    // *Should* be able to set readMessages permission on guests/everyone.
    await fetch(port, '/roles/_guest', {
      method: 'PATCH',
      body: JSON.stringify({permissions: {readMessages: false}})
    })
  })
})

test('DELETE /api/roles/:id', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID } = await makeOwner(server, port)

    const { role: { id } } = await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        sessionID,
        name: 'Test',
        permissions: {}
      })
    })

    await fetch(port, '/roles/' + id)

    t.is((await fetch(port, '/roles')).roles.length, 5)

    await fetch(port, `/roles/${id}?sessionID=${sessionID}`, {method: 'DELETE'})

    t.is((await fetch(port, '/roles')).roles.length, 4)

    try {
      await fetch(port, '/roles/' + id)
      t.fail('Could fetch deleted role')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }

    try {
      await fetch(port, `/roles/_user?sessionID=${sessionID}`, {method: 'DELETE'})
      t.fail('Could delete internal role')
    } catch (error) {
      t.is(error.code, 'NOT_DELETABLE_ROLE')
    }
  })
})

test('PATCH/GET /api/roles/order', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID } = await makeOwner(server, port)

    const ownerRoleID = (await fetch(port, '/roles')).roles.find(
      r => r.name === 'Owner').id

    t.deepEqual(await fetch(port, '/roles/order'), {roleIDs: [ownerRoleID]})

    const { role: { id: id1 } } = await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        sessionID,
        name: 'Role 1',
        permissions: {}
      })
    })

    const { role: { id: id2 } } = await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        sessionID,
        name: 'Role 2',
        permissions: {}
      })
    })

    // Default prioritization order should be role 2 then role 1, because
    // newer roles are more prioritized.
    t.deepEqual(await fetch(port, '/roles/order'), {roleIDs: [id2, id1, ownerRoleID]})

    // Now re-order it:
    const response = await fetch(port, '/roles/order?sessionID=' + sessionID, {
      method: 'PATCH',
      body: JSON.stringify({
        roleIDs: [ownerRoleID, id1, id2]
      })
    })
    t.deepEqual(response, {})

    // Check that this is reflected:
    t.deepEqual(await fetch(port, '/roles/order'), {roleIDs: [ownerRoleID, id1, id2]})

    // Remove a role:
    await fetch(port, '/roles/' + id1, {
      method: 'DELETE',
      body: JSON.stringify({
        sessionID
      })
    })

    // And make sure that deleting the role is reflected:
    t.deepEqual(await fetch(port, '/roles/order'), {roleIDs: [ownerRoleID, id2]})
  })
})

// Not strictly from the roles API, but related enough.
test('GET /api/users/:userID/permissions', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { user: { id: userID } } = await makeUser(server, port)
    const response = await fetch(port, `/users/${userID}/permissions`)
    t.deepEqual(Object.keys(response), ['permissions'])
    t.true(Object.values(response.permissions).every(v => typeof v === 'boolean'))
  })
})
