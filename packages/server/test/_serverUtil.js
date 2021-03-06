const fetch = require('./_fetch')
const spawn = require('./_spawn')
const shortid = require('shortid')
const makeCommonUtils = require('../common')
const { makeMiddleware } = require('../middleware')
const makeSerializers = require('../serialize')
const { setSetting, serverPropertiesID, getAllSettings } = require('../settings')

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

  const userID = user.id

  return {user, userID, sessionID}
}

const giveOwnerRole = async (server, userID) => {
  let ownerRole = await server.db.roles.findOne({name: 'Owner'})

  if (!ownerRole) {
    const name = 'Owner'
    const permissions = {}

    for (const key of require('../roles').permissionKeys) {
      permissions[key] = true // Grant every permission
    }

    const role = await server.db.roles.insert({
      name, permissions
    })

    // Also add the role to the role prioritization order
    const { rolePrioritizationOrder } = await getAllSettings(server.db.settings, serverPropertiesID)
    rolePrioritizationOrder.unshift(role._id)
    await setSetting(
      server.db.settings, serverPropertiesID,
      'rolePrioritizationOrder', rolePrioritizationOrder
    )

    ownerRole = role
  }

  await server.db.users.update({_id: userID}, {
    $push: {roleIDs: ownerRole._id}
  })

  return { ownerRole, ownerRoleID: ownerRole._id }
}

const makeOwner = async (server, port, username = 'test_admin_' + shortid()) => {
  const { user, userID, sessionID } = await makeUser(server, port, username)

  const { ownerRole, ownerRoleID } = await giveOwnerRole(server, userID)

  return {user, userID, sessionID, ownerRole, ownerRoleID}
}

const makeRole = async (server, port, permissions = {}, name = 'test_role_' + shortid(), sessionID = null) => {
  if (sessionID === null) {
    sessionID = (await makeOwner(server, port)).sessionID
  }

  const { roleID } = await fetch(port, '/roles', {
    method: 'POST',
    body: JSON.stringify({
      name, permissions, sessionID
    })
  })

  return {roleID, sessionID}
}

const giveRole = async (server, port, roleID, userID) => {
  // TODO: Get rid of port argument, it's not used.
  //  - Also make sure callers aren't passing the sessionID argument
  //    (5th argument).
  // Dirtily add the role (i.e. by messing with the database).
  await server.db.users.update({_id: userID}, {$push: {roleIDs: roleID}})
}

const makeUserWithPermissions = async (server, port, permissions) => {
  const { sessionID: ownerSessionID } = await makeOwner(server, port)
  const { sessionID, userID } = await makeUser(server, port)
  const { roleID } = await makeRole(server, port, permissions, undefined, ownerSessionID)
  await giveRole(server, port, roleID, userID, ownerSessionID)

  return { sessionID, userID, ownerSessionID}
}

const orderRoles = async (server, port, roleIDs, sessionID = null) => {
  if (sessionID === null) {
    sessionID = (await makeOwner(server, port)).sessionID
  }

  await fetch(port, '/roles/order?sessionID=' + sessionID, {
    method: 'PATCH',
    body: JSON.stringify({roleIDs})
  })

  return { sessionID }
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

module.exports = {
  testWithServer,
  makeUserWithoutSession, makeUser, makeOwner, makeUserWithPermissions,
  makeRole, giveRole, orderRoles, giveOwnerRole,
  makeChannel, makeMessage
}
