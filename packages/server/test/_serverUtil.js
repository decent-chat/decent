const fetch = require('./_fetch')
const spawn = require('./_spawn')
const shortid = require('shortid')
const makeCommonUtils = require('../common')
const { makeMiddleware } = require('../middleware')
const makeSerializers = require('../serialize')

const testWithServer = async (port, cb) => {
  const server = await spawn(port)
  const connectedSocketsMap = new Map()
  const util = makeCommonUtils({db: server.db, connectedSocketsMap})
  const middleware = makeMiddleware({db: server.db, util})
  const serialize = makeSerializers({db: server.db, util})
  try {
    await cb({port, server, middleware, serialize, util, connectedSocketsMap})
  } finally {
    await server.kill()
  }
}

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

const makeChannel = async (server, port, name = 'test_channel_' + shortid(), sessionID = null) => {
  if (sessionID === null) {
    sessionID = (await makeAdmin(server, port)).sessionID
  }

  const { channelID } = await fetch(port, '/channels', {
    method: 'POST',
    body: JSON.stringify({
      name, sessionID
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
      channelID, text, sessionID
    })
  })

  return {messageID, channelID, sessionID}
}

module.exports = {testWithServer, makeUser, makeAdmin, makeChannel, makeMessage}
