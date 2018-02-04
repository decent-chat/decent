const fetch = require('./_fetch')

const makeUser = async (server, port, username = 'test_user', password = 'abcdef') => {
  const { user } = await fetch(port, '/register', {
    method: 'POST',
    body: JSON.stringify({username, password})
  })

  const { sessionID } = await fetch(port, '/login', {
    method: 'POST',
    body: JSON.stringify({username, password})
  })

  return {user, sessionID}
}

const makeAdmin = async (server, port, username = 'admin') => {
  const { user: admin, sessionID } = await makeUser(server, port, username)

  await server.db.users.update({username}, {
    $set: {
      permissionLevel: 'admin',
      authorized: true
    }
  })

  return {admin, sessionID}
}

module.exports = {makeUser, makeAdmin}
