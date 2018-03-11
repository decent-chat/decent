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

const makeUserWithoutSession = async (server, port, username = 'test_user_' + shortid(), password = 'abcdef') => {
  const { user } = await fetch(port, '/users', {
    method: 'POST',
    body: JSON.stringify({username, password})
  })

  return { user, username, password }
}

const makeUser = async (server, port, inUsername = undefined, inPassword = undefined) => {
  const { user, username, password } = await makeUserWithoutSession(server, port, inUsername, inPassword)

  const { sessionID } = await fetch(port, '/sessions', {
    method: 'POST',
    body: JSON.stringify({username, password})
  })

  return {user, sessionID}
}

const giveOwnerRole = async (server, userID) => {
  await server.db.users.update({_id: userID}, {
    $push: {roleIDs: (await server.db.roles.findOne({name: 'Owner'}))._id}
  })
}

const makeOwner = async (server, port, username = 'test_admin_' + shortid()) => {
  const { user, sessionID } = await makeUser(server, port, username)

  await giveOwnerRole(server, user)

  return {user, sessionID}
}

const makeChannel = async (server, port, name = 'test_channel_' + shortid(), sessionID = null) => {
  if (sessionID === null) {
    sessionID = (await makeOwner(server, port)).sessionID
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

const enableAuthorization = async server => {
  await server.settings.setSetting(server.db.settings, server.settings.serverPropertiesID, 'requireAuthorization', 'on')
}

module.exports = {
  testWithServer,
  makeUserWithoutSession, makeUser, makeOwner, giveOwnerRole,
  makeChannel, makeMessage,
  enableAuthorization
}
