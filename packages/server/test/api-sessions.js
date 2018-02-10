const { test } = require('ava')
const { testWithServer, makeUser, makeUserWithoutSession } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForSessionTests = 28000

test('POST /api/sessions', t => {
  return testWithServer(portForSessionTests++, async ({ server, port }) => {
    const { username, password } = await makeUserWithoutSession(server, port)

    const response = await fetch(port, '/sessions', {
      method: 'POST',
      body: JSON.stringify({username, password})
    })

    t.deepEqual(Object.keys(response), ['sessionID'])

    try {
      await fetch(port, '/sessions', {
        method: 'POST',
        body: JSON.stringify({username, password: 'a'})
      })
      t.fail('Could log in without the correct password')
    } catch (error) {
      t.is(error.code, 'INCORRECT_PASSWORD')
    }

    try {
      await fetch(port, '/sessions', {
        method: 'POST',
        body: JSON.stringify({username: 'a', password: 'a'})
      })
      t.fail('Could log in to a user who does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }

    try {
      await fetch(port, '/sessions', {
        method: 'POST',
        body: JSON.stringify({username: 'a'})
      })
      t.fail('Could log in without specifying password')
    } catch (error) {
      t.is(error.code, 'INCOMPLETE_PARAMETERS')
      t.is(error.missing, 'password')
    }

    try {
      await fetch(port, '/sessions', {
        method: 'POST',
        body: JSON.stringify({password: 'a'})
      })
      t.fail('Could log in without specifying username')
    } catch (error) {
      t.is(error.code, 'INCOMPLETE_PARAMETERS')
      t.is(error.missing, 'username')
    }

    try {
      await fetch(port, '/sessions', {
        method: 'POST',
        body: JSON.stringify({username: 123, password: 'a'})
      })
      t.fail('Could log in with non-string username')
    } catch (error) {
      t.is(error.code, 'INVALID_PARAMETER_TYPE')
    }

    try {
      await fetch(port, '/sessions', {
        method: 'POST',
        body: JSON.stringify({username: 'a', password: 123})
      })
      t.fail('Could log in with non-string password')
    } catch (error) {
      t.is(error.code, 'INVALID_PARAMETER_TYPE')
    }
  })
})

test('GET /api/sessions', t => {
  return testWithServer(portForSessionTests++, async ({ server, port }) => {
    const { username, password } = await makeUserWithoutSession(server, port)

    const { sessionID } = await fetch(port, '/sessions', {
      method: 'POST',
      body: JSON.stringify({username, password})
    })

    const response = await fetch(port, '/sessions?sessionID=' + sessionID)
    t.deepEqual(Object.keys(response), ['sessions'])
    t.is(response.sessions.length, 1)

    const { sessionID: sessionID2 } = await fetch(port, '/sessions', {
      method: 'POST',
      body: JSON.stringify({username, password})
    })

    const response2 = await fetch(port, '/sessions?sessionID=' + sessionID)
    t.is(response2.sessions.length, 2)

    const response3 = await fetch(port, '/sessions?sessionID=' + sessionID2)
    t.is(response3.sessions.length, 2)
  })
})

test('GET /api/sessions/:sessionID', t => {
  return testWithServer(portForSessionTests++, async ({ server, port }) => {
    const { sessionID } = await makeUser(server, port)

    const response = await fetch(port, '/sessions/' + sessionID)
    t.deepEqual(Object.keys(response), ['session', 'user'])
    t.deepEqual(Object.keys(response.session), ['id', 'dateCreated'])
    t.is(response.session.id, sessionID)
    t.is(typeof response.session.dateCreated, 'number')

    try {
      await fetch(port, '/sessions/a')
      t.fail('Could fetch session that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }
  })
})

test('DELETE /api/sessions/:sessionID', t => {
  return testWithServer(portForSessionTests++, async ({ server, port }) => {
    const { sessionID, user: { id: userID } } = await makeUser(server, port)
    t.is(await server.db.sessions.count({userID}), 1)

    const response = await fetch(port, '/sessions/' + sessionID, {
      method: 'DELETE'
    })
    t.deepEqual(response, {})
    t.is(await server.db.sessions.count({userID}), 0)

    try {
      await fetch(port, '/sessions/a', {
        method: 'DELETE'
      })
      t.fail('Could delete session that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }
  })
})
