const { test } = require('ava')
const { testWithServer, makeOwner, makeUser, makeUserWithPermissions, giveRole, makeRole } = require('./_serverUtil')
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

    t.deepEqual(Object.keys(response), ['roleID'])
    t.is(typeof response.roleID, 'string')

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

    t.is(response.roles.length, 2)
    t.true(response.roles.some(r => r.id === '_everyone'))
    t.true(response.roles.some(r => r.id === '_user'))
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
    t.is(response.roles.length, 4)

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

    try {
      await fetch(port, '/roles/_everyone', {
        method: 'PATCH',
        body: JSON.stringify({permissions: {sendMessages: true}})
      })
      t.fail('Could set non-guest permission on _everyone')
    } catch (error) {
      t.is(error.code, 'NOT_GUEST_PERMISSION')
    }

    // *Should* be able to set readMessages permission on everyone.
    await fetch(port, '/roles/_everyone', {
      method: 'PATCH',
      body: JSON.stringify({permissions: {readMessages: false}})
    })
  })
})

test('DELETE /api/roles/:id', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID } = await makeOwner(server, port)

    const { roleID } = await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        sessionID,
        name: 'Test',
        permissions: {}
      })
    })

    await fetch(port, '/roles/' + roleID)

    t.is((await fetch(port, '/roles')).roles.length, 4)

    await fetch(port, `/roles/${roleID}?sessionID=${sessionID}`, {method: 'DELETE'})

    t.is((await fetch(port, '/roles')).roles.length, 3)

    try {
      await fetch(port, '/roles/' + roleID)
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
    const { sessionID, ownerRoleID } = await makeOwner(server, port)

    t.deepEqual(await fetch(port, '/roles/order'), {roleIDs: [ownerRoleID]})

    const { roleID: roleID1 } = await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        sessionID,
        name: 'Role 1',
        permissions: {}
      })
    })

    const { roleID: roleID2 } = await fetch(port, '/roles', {
      method: 'POST',
      body: JSON.stringify({
        sessionID,
        name: 'Role 2',
        permissions: {}
      })
    })

    // Default prioritization order should be role 2 then role 1, because
    // newer roles are more prioritized, but both of those should be below
    // the owner role, because that's the highest role of the user who
    // created the two new roles.
    t.deepEqual(await fetch(port, '/roles/order'), {roleIDs: [ownerRoleID, roleID2, roleID1]})

    // Now re-order it:
    const response = await fetch(port, '/roles/order?sessionID=' + sessionID, {
      method: 'PATCH',
      body: JSON.stringify({
        roleIDs: [ownerRoleID, roleID1, roleID2]
      })
    })
    t.deepEqual(response, {})

    // Check that this is reflected:
    t.deepEqual(await fetch(port, '/roles/order'), {roleIDs: [ownerRoleID, roleID1, roleID2]})

    // Remove a role:
    await fetch(port, '/roles/' + roleID1, {
      method: 'DELETE',
      body: JSON.stringify({
        sessionID
      })
    })

    // And make sure that deleting the role is reflected:
    t.deepEqual(await fetch(port, '/roles/order'), {roleIDs: [ownerRoleID, roleID2]})
  })
})

// The following endpoints aren't strictly from the roles API, but are related enough.

test('GET /api/users/:userID/permissions', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { user: { id: userID } } = await makeUser(server, port)
    const response = await fetch(port, `/users/${userID}/permissions`)
    t.deepEqual(Object.keys(response), ['permissions'])
    t.true(Object.values(response.permissions).every(v => typeof v === 'boolean'))
  })
})

test('POST /api/users/:userID/roles', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID: ownerSessionID } = await makeOwner(server, port)

    {
      const { roleID } = await makeRole(server, port)
      const { userID } = await makeUser(server, port)
      const response = await fetch(port, `/users/${userID}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          sessionID: ownerSessionID,
          roleID
        })
      })
      t.deepEqual(response, {})
      t.true((await fetch(port, `/users/${userID}`)).user.roleIDs.includes(roleID))
    }

    try {
      const { userID } = await makeUser(server, port)
      await fetch(port, `/users/${userID}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          sessionID: ownerSessionID
        })
      })
      t.fail('Could give a role without specifying which role to give')
    } catch (error) {
      t.is(error.code, 'INCOMPLETE_PARAMETERS')
    }

    try {
      const { userID } = await makeUser(server, port)
      await fetch(port, `/users/${userID}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          sessionID: ownerSessionID,
          roleID: 'a'
        })
      })
      t.fail('Could give a role that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }

    {
      const { sessionID } = await makeUserWithPermissions(server, port, {
        manageRoles: false
      })
      const { userID } = await makeUser(server, port)
      const { roleID } = await makeRole(server, port)
      try {
        await fetch(port, `/users/${userID}/roles`, {
          method: 'POST',
          body: JSON.stringify({
            sessionID, roleID
          })
        })
        t.fail('Could give a role without having manageRoles')
      } catch (error) {
        t.is(error.code, 'NOT_ALLOWED')
      }
    }

    {
      const { userID } = await makeUser(server, port)

      const { sessionID } = await makeUserWithPermissions(server, port, {
        manageRoles: true,
        manageChannels: false,
        manageEmotes: true
      })

      const { roleID } = await makeRole(server, port, {
        manageChannels: true
      })

      const { roleID: roleID2 } = await makeRole(server, port, {
        manageChannels: false
      })

      const { roleID: roleID3 } = await makeRole(server, port, {
        manageEmotes: true
      })

      try {
        await fetch(port, `/users/${userID}/roles`, {
          method: 'POST',
          body: JSON.stringify({
            sessionID, roleID
          })
        })
        t.fail('Could give a role without having a permission it specifies (as true)')
      } catch (error) {
        t.is(error.code, 'NOT_ALLOWED')
      }

      try {
        await fetch(port, `/users/${userID}/roles`, {
          method: 'POST',
          body: JSON.stringify({
            sessionID, roleID: roleID2
          })
        })
        t.fail('Could give a role without having a permission it specifies (as false)')
      } catch (error) {
        t.is(error.code, 'NOT_ALLOWED')
      }

      // This SHOULD work!
      try {
        await fetch(port, `/users/${userID}/roles`, {
          method: 'POST',
          body: JSON.stringify({
            sessionID, roleID: roleID3
          })
        })
      } catch (error) {
        t.fail('Could NOT give a role despite having the permissions it specifies')
      }
    }
  })
})

test('DELETE /api/users/:userID/roles/:roleID', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    const { sessionID: ownerSessionID } = await makeOwner(server, port)

    const makeSetupUser = async roleID => {
      const { userID } = await makeUser(server, port)
      await giveRole(server, port, roleID, userID)
      return { userID }
    }

    {
      const { roleID } = await makeRole(server, port)
      const { userID } = await makeSetupUser(roleID)
      // Sanity check:
      t.true((await fetch(port, `/users/${userID}`)).user.roleIDs.includes(roleID))
      // Now take it:
      const response = await fetch(port, `/users/${userID}/roles/${roleID}`, {
        method: 'DELETE',
        body: JSON.stringify({sessionID: ownerSessionID})
      })
      t.deepEqual(response, {})
      t.false((await fetch(port, `/users/${userID}`)).user.roleIDs.includes(roleID))
    }

    try {
      const { user: { id: userID } } = await makeUser(server, port)
      await fetch(port, `/users/${userID}/roles/a`, {
        method: 'DELETE',
        body: JSON.stringify({sessionID: ownerSessionID})
      })
      t.fail('Could take a role that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }

    {
      const { sessionID } = await makeUserWithPermissions(server, port, {
        manageRoles: false
      })
      const { userID } = await makeUser(server, port)
      const { roleID } = await makeRole(server, port)
      try {
        await fetch(port, `/users/${userID}/roles/${roleID}`, {
          method: 'DELETE',
          body: JSON.stringify({sessionID})
        })
        t.fail('Could take a role without having manageRoles')
      } catch (error) {
        t.is(error.code, 'NOT_ALLOWED')
      }
    }

    {
      const { userID } = await makeUser(server, port)

      const { sessionID } = await makeUserWithPermissions(server, port, {
        manageRoles: true,
        manageChannels: false,
        manageEmotes: true
      })

      const { roleID } = await makeRole(server, port, {
        manageChannels: true
      })

      const { roleID: roleID2 } = await makeRole(server, port, {
        manageChannels: false
      })

      const { roleID: roleID3 } = await makeRole(server, port, {
        manageEmotes: true
      })

      for (const id of [roleID, roleID2, roleID3]) {
        await giveRole(server, port, id, userID)
      }

      try {
        await fetch(port, `/users/${userID}/roles/${roleID}`, {
          method: 'DELETE',
          body: JSON.stringify({sessionID})
        })
        t.fail('Could take a role without having a permission it specifies (as true)')
      } catch (error) {
        t.is(error.code, 'NOT_ALLOWED')
      }

      try {
        await fetch(port, `/users/${userID}/roles/${roleID2}`, {
          method: 'DELETE',
          body: JSON.stringify({sessionID})
        })
        t.fail('Could take a role without having a permission it specifies (as false)')
      } catch (error) {
        t.is(error.code, 'NOT_ALLOWED')
      }

      // This SHOULD work!
      try {
        await fetch(port, `/users/${userID}/roles/${roleID3}`, {
          method: 'DELETE',
          body: JSON.stringify({sessionID})
        })
      } catch (error) {
        t.fail('Could NOT take a role despite having the permissions it specifies')
      }
    }
  })
})

test('GET /api/users/:id/roles', t => {
  return testWithServer(portForApiRoleTests++, async ({ server, port }) => {
    // Should report the same data as /users/:id.
    const { user: { id: userID } } = await makeUser(server, port)
    await giveRole(server, port, (await makeRole(server, port, {})).roleID, userID)
    const { user: { roleIDs: idsFromUser } } = await fetch(port, `/users/${userID}`)
    const { roleIDs: idsFromRoles } = await fetch(port, `/users/${userID}/roles`)
    t.deepEqual(idsFromRoles, idsFromUser)
  })
})
