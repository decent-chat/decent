const fetch = require('./_fetch')
const shortid = require('shortid')

const makeUser = async (server, port, username = 'test_user_' + shortid(), password = 'abcdef') => {
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

const makeAdmin = async (server, port, username = 'test_admin_' + shortid()) => {
  const { user: admin, sessionID } = await makeUser(server, port, username)

  await server.db.users.update({username}, {
    $set: {
      permissionLevel: 'admin',
      authorized: true
    }
  })

  return {admin, sessionID}
}

const makeChannel = async (server, port, channelName = 'test_channel_' + shortid(), sessionID = null) => {
  if (sessionID === null) {
    sessionID = (await makeAdmin(server, port)).sessionID
  }

  const { channelID } = await fetch(port, '/channels', {
    method: 'POST',
    body: JSON.stringify({
      name: 'general', sessionID
    })
  })

  return {channelID, sessionID}
}

const makeMessage = async (server, port, text = 'Hello.', channelID = null, sessionID = null) => {
  if (channelID === null) {
    channelID = (await makeChannel(server, port)).channelID
  }

  if (sessionID === null) {
    sessionID = (await makeUser(server, port)).sessionID
  }

  const { messageID } = await fetch(port, '/messages', {
    method: 'POST',
    body: JSON.stringify({
      channelID, text: 'Hello, world!', sessionID
    })
  })

  return {messageID, channelID, sessionID}
}

module.exports = {makeUser, makeAdmin, makeChannel, makeMessage}
