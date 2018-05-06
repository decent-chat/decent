const { test } = require('ava')
const { testWithServer, makeUser, makeOwner, enableAuthorization } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiUserTests = 30000

test('POST /api/users', t => {
  return testWithServer(portForApiUserTests++, async ({ server, port }) => {
    t.is((await server.db.users.find({})).length, 0)

    const response = await fetch(port, '/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'gadget', password: 'minecraft'
      })
    })

    t.deepEqual(Object.keys(response), ['user'])
    t.is(response.user.username, 'gadget')
    t.is(typeof response.user.id, 'string')

    t.is((await server.db.users.find({})).length, 1)
    const userDoc = await server.db.users.findOne({_id: response.user.id})
    t.not(userDoc, null)
    t.is(userDoc.username, 'gadget')

    try {
      await fetch(port, '/users', {
        method: 'POST',
        body: JSON.stringify({
          username: 'gadget', password: 'mineycrafta'
        })
      })
      t.fail('Could register with an already-taken username')
    } catch (error) {
      t.is(error.code, 'NAME_ALREADY_TAKEN')
    }

    try {
      await fetch(port, '/users/', {
        method: 'POST',
        body: JSON.stringify({
          username: 'omg I l%ve m!necr&ft', password: 'stevens'
        })
      })
      t.fail('Could register with an invalid name')
    } catch (error) {
      t.is(error.code, 'INVALID_NAME')
    }

    try {
      const response = await fetch(port, '/users/', {
        method: 'POST',
        body: JSON.stringify({
          username: 'burrito', password: 'taco'
        })
      })
      t.fail('Could register with < 6 character password')
    } catch (error) {
      t.is(error.code, 'SHORT_PASSWORD')
    }

    try {
      const response = await fetch(port, '/users', {
        method: 'POST',
        body: JSON.stringify({
          username: 737, password: 'lololol'
        })
      })
      t.fail('Could register with a non-string username')
    } catch (error) {
      t.is(error.code, 'INVALID_PARAMETER_TYPE')
    }

    try {
      const response = await fetch(port, '/users', {
        method: 'POST',
        body: JSON.stringify({
          username: 'spooky', password: {hijacked: 'lol'}
        })
      })
      t.fail('Could register with a non-string password')
    } catch (error) {
      t.is(error.code, 'INVALID_PARAMETER_TYPE')
    }
  })
})

test('GET /api/users (no authorization)', t => {
  return testWithServer(portForApiUserTests++, async ({ server, port }) => {
    const response = await fetch(port, '/users')
    t.deepEqual(response, {users: []})

    const { user } = await makeUser(server, port)

    const response2 = await fetch(port, '/users')
    t.is(response2.users.length, 1)
    t.is(response2.users[0].id, user.id)
  })
})

test('GET /api/users/:id', t => {
  return testWithServer(portForApiUserTests++, async ({ server, port }) => {
    const { user: { id: userID }, sessionID } = await makeUser(server, port)

    const response = await fetch(port, '/users/' + userID)
    t.deepEqual(Object.keys(response), ['user'])
    t.is(response.user.id, userID)

    const response2 = await fetch(port, `/users/${userID}?sessionID=${sessionID}`)
    t.is(response2.user.email, null)

    try {
      await fetch(port, '/users/a')
      t.fail('Could fetch user that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }
  })
})

test('GET /api/username-available/:username', t => {
  return testWithServer(portForApiUserTests++, async ({ server, port }) => {
    const response = await fetch(port, '/username-available/glory')
    t.deepEqual(response, {available: true})

    await makeUser(server, port, 'glory')

    const response2 = await fetch(port, '/username-available/glory')
    t.deepEqual(response2, {available: false})

    try {
      await fetch(port, '/username-available/burrito lord')
      t.fail('Could check availability of invalid username')
    } catch (error) {
      t.is(error.code, 'INVALID_NAME')
    }
  })
})

test('PATCH /api/users/:id', t => {
  return testWithServer(portForApiUserTests++, async ({ server, port }) => {
    const { user, sessionID: userSessionID } = await makeUser(server, port, 'test_user', 'password')
    const { admin, sessionID: adminSessionID } = await makeOwner(server, port)

    const getUser = () => fetch(port, '/users/' + user.id, {
      sessionID: userSessionID
    }).then(resp => resp.user)

    let updatedUser, response

    // Attempting without sessionID
    try {
      await fetch(port, `/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: 'test_user@decent.chat',
        })
      })

      t.fail()
    } catch (error) {
      t.is(error.code, 'INCOMPLETE_PARAMETERS')
    }

    // Changing password (incorrectly)
    try {
      await fetch(port, `/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sessionID: userSessionID,

          email: 'test_user@decent.chat', // The entire request should be a no-op if anything fails
          password: {old: 'wrong', new: 'betterpassword'},
        })
      })

      t.fail()
    } catch (error) {
      t.is(error.code, 'INCORRECT_PASSWORD')

      updatedUser = await getUser()
      t.not(updatedUser.email, 'test_user@decent.chat') // Should be no-op
    }

    // Changing password and flair
    await fetch(port, `/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        sessionID: userSessionID,

        flair: 'Best of all the test users',
        password: {old: 'password', new: 'betterpassword'},
      })
    })

    updatedUser = await getUser()
    t.is(updatedUser.flair, 'Best of all the test users')
    t.is(updatedUser.email, undefined)
  })
})
