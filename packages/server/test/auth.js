const { test } = require('ava')
const fetch = require('./_fetch')
const spawn = require('./_spawn')

const makeUser = async (server, port, username = 'test_user') => {
  const { user } = await fetch(port, '/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password: 'abcdef'
    })
  })

  const { sessionID } = await fetch(port, '/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password: 'abcdef'
    })
  })

  return { user, sessionID }
}

const makeAdmin = async (server, port, username = 'admin') => {
  const { user: admin, sessionID } = await makeUser(server, port, username)

  await server.db.users.update({ username }, {
    $set: {
      permissionLevel: 'admin',
      authorized: true
    }
  })

  return { admin, sessionID }
}

test('register', async t => {
  const { server, port } = await spawn()

  const { user } = await fetch(port, '/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'test_user',
      password: 'abcdef'
    })
  })

  t.truthy(user)

  const userFromDB = await server.db.users.findOne({ _id: user.id })
  t.truthy(userFromDB)

  await server.kill()
})

test('login', async t => {
  const { server, port } = await spawn()

  const { user } = await fetch(port, '/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'test_user',
      password: 'abcdef'
    })
  })

  const { sessionID } = await fetch(port, '/login', {
    method: 'POST',
    body: JSON.stringify({
      username: 'test_user',
      password: 'abcdef'
    })
  })

  const session = await server.db.sessions.findOne({ _id: sessionID })
  t.true(session.userID === user.id)

  await server.kill()
})

test('username-available', async t => {
  const { server, port } = await spawn()

  const { available: before } = await fetch(port, '/username-available/test_user')
  t.true(before)

  await fetch(port, '/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'test_user',
      password: 'abcdef'
    })
  })

  const { available: after } = await fetch(port, '/username-available/test_user')
  t.false(after)

  await server.kill()
})

test('authorize-user', async t => {
  const { server, port } = await spawn()
  await server.settings.setSetting(server.db.settings, server.settings.serverPropertiesID, 'requireAuthorization', 'on')

  const { admin, sessionID } = await makeAdmin(server, port)
  const { user } = await makeUser(server, port)

  const userBefore = await server.db.users.findOne({ _id: user.id })
  t.false(userBefore.authorized)

  await fetch(port, '/authorize-user', {
    method: 'POST',
    body: JSON.stringify({
      userID: user.id,
      sessionID
    })
  })

  const userAfter = await server.db.users.findOne({ _id: user.id })
  t.true(userAfter.authorized)

  await fetch(port, '/deauthorize-user', {
    method: 'POST',
    body: JSON.stringify({
      userID: user.id,
      sessionID
    })
  })

  const userAfterDeauth = await server.db.users.findOne({ _id: user.id })
  t.false(userAfterDeauth.authorized)

  await server.kill()
})
