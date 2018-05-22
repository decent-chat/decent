const { test } = require('ava')
const { testWithServer, makeUser, makeMessage, makeRole, giveRole, orderRoles, giveOwnerRole } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForCommonTests = 24000

test('isNameValid', t => {
  return testWithServer(portForCommonTests++, ({ util }) => {
    t.true(util.isNameValid('joe'))
    t.false(util.isNameValid('joe smith'))
    t.false(util.isNameValid(''))
    t.true(util.isNameValid('Joey-123_456'))
  })
})

test('getUserIDBySessionID', t => {
  return testWithServer(portForCommonTests++, async ({ util, server, port }) => {
    const { user, sessionID } = await makeUser(server, port)
    t.is(await util.getUserIDBySessionID(sessionID), user.id)
    t.is(await util.getUserIDBySessionID(), null)
    t.is(await util.getUserIDBySessionID('a'), null)
  })
})

test('getUserBySessionID', t => {
  return testWithServer(portForCommonTests++, async ({ util, server, port }) => {
    const { user, sessionID } = await makeUser(server, port)
    t.is((await util.getUserBySessionID(sessionID))._id, user.id)
    t.is(await util.getUserBySessionID(), null)
    t.is(await util.getUserBySessionID('a'), null)
    await server.db.users.remove({_id: user.id})
    t.is(await util.getUserBySessionID(sessionID), null)
  })
})

test('md5', t => {
  return testWithServer(portForCommonTests++, ({ util }) => {
    t.is(util.md5('john'), '527bd5b5d689e2c32ae974c6229ff785')
    try {
      util.md5()
      t.fail()
    } catch(err) {
      t.pass()
    }
    try {
      util.md5('')
      t.fail()
    } catch(err) {
      t.pass()
    }
    try {
      util.md5(123)
      t.fail()
    } catch(err) {
      t.pass()
    }
  })
})

test('emailToAvatarURL', t => {
  return testWithServer(portForCommonTests++, ({ util }) => {
    t.is(util.emailToAvatarURL('towerofnix@gmail.com'),
      `https://gravatar.com/avatar/${util.md5('towerofnix@gmail.com')}?d=retro`
    )
    t.is(util.emailToAvatarURL(''),
      'https://gravatar.com/avatar/?d=retro'
    )
  })
})

test('isUserOnline', t => {
  return testWithServer(portForCommonTests++, async ({ util, server, port, connectedSocketsMap }) => {
    const { user } = await makeUser(server, port)
    t.false(util.isUserOnline(user.id))
    connectedSocketsMap.set({}, {userID: user.id})
    t.true(util.isUserOnline(user.id))
  })
})

// TODO: Test for getUserPermissions.

const PERMISSION_USERS_HAVE = 'sendMessages'
const OTHER_PERMISSION_USERS_HAVE = 'readMessages'
const PERMISSION_USERS_DO_NOT_HAVE = 'manageChannels'

test('userHasPermission', t => {
  // Only basic testing here - proper testing for user permission evaluation
  // done in the getUserPermissions test.
  return testWithServer(portForCommonTests++, async ({ util, server, port }) => {
    const { user: { id: userID } } = await makeUser(server, port)
    t.true(await util.userHasPermission(userID,  PERMISSION_USERS_HAVE))
    t.false(await util.userHasPermission(userID, PERMISSION_USERS_DO_NOT_HAVE))
    t.false(await util.userHasPermission(userID, 'bogusPermissionThatDoesNotExist'))

    const { roleID, sessionID: ownerSessionID } = await makeRole(server, port, {
      [PERMISSION_USERS_DO_NOT_HAVE]: true
    })
    await giveRole(server, port, roleID, userID, ownerSessionID)
    t.true(await util.userHasPermission(userID, PERMISSION_USERS_DO_NOT_HAVE))

    // TODO: Test for channel-specific permissions.
  })
})

test('userHasPermissions', t => {
  return testWithServer(portForCommonTests++, async ({ util, server, port }) => {
    const { user: { id: userID } } = await makeUser(server, port)
    t.true(await util.userHasPermissions(userID, [PERMISSION_USERS_HAVE, OTHER_PERMISSION_USERS_HAVE]))
    t.false(await util.userHasPermissions(userID, [PERMISSION_USERS_HAVE, PERMISSION_USERS_DO_NOT_HAVE]))
    t.true(await util.userHasPermissions(userID, [PERMISSION_USERS_HAVE]))
    t.false(await util.userHasPermissions(userID, [PERMISSION_USERS_DO_NOT_HAVE]))
  })
})

test('userHasPermissionsOfRole', t => {
  return testWithServer(portForCommonTests++, async ({ util, server, port }) => {
    const { user: { id: userID } } = await makeUser(server, port)
    const { roleID, sessionID: ownerSessionID } = await makeRole(server, port, {
      [PERMISSION_USERS_DO_NOT_HAVE]: true
    })
    t.false(await util.userHasPermissionsOfRole(userID, roleID))

    const { roleID: roleID2 } = await makeRole(server, port, {
      [PERMISSION_USERS_DO_NOT_HAVE]: false
    })
    t.false(await util.userHasPermissionsOfRole(userID, roleID2))

    const { roleID: roleID3 } = await makeRole(server, port, {
      [PERMISSION_USERS_HAVE]: true,
      [OTHER_PERMISSION_USERS_HAVE]: true
    })
    t.true(await util.userHasPermissionsOfRole(userID, roleID3))

    await giveRole(server, port, roleID, userID, ownerSessionID)
    t.true(await util.userHasPermissionsOfRole(userID, roleID))

    // Sanity check -- the user's permission must be TRUE in order for it to count!
    // (We create a fresh user without the role.)
    const { user: { id: userID2 } } = await makeUser(server, port)
    await giveRole(server, port, roleID2, userID, ownerSessionID)
    t.false(await util.userHasPermissionsOfRole(userID, roleID))
  })
})

test('getHighestRoleOfUser', t => {
  return testWithServer(portForCommonTests++, async ({ util, server, port }) => {
    const { userID } = await makeUser(server, port)
    t.is(await util.getHighestRoleOfUser(userID), null)

    // We have to be a bit careful about the "owner" role here. We need to keep
    // track of its ID, because it's part of the role prioritization order.

    const { userID: ownerUserID, sessionID: ownerSessionID } = await makeUser(server, port)
    const { ownerRoleID } = await giveOwnerRole(server, ownerUserID)

    const { roleID: roleID1 } = await makeRole(server, port, undefined, undefined, ownerSessionID)
    const { roleID: roleID2 } = await makeRole(server, port, undefined, undefined, ownerSessionID)
    await giveRole(server, port, roleID1, userID, ownerSessionID)
    await giveRole(server, port, roleID2, userID, ownerSessionID)

    await orderRoles(server, port, [ownerRoleID, roleID1, roleID2], ownerSessionID)
    t.is(await util.getHighestRoleOfUser(userID), roleID1)

    await orderRoles(server, port, [ownerRoleID, roleID2, roleID1], ownerSessionID)
    t.is(await util.getHighestRoleOfUser(userID), roleID2)
  })
})

test('getUnreadMessageCountInChannel', t => {
  return testWithServer(portForCommonTests++, async ({ util, server, port }) => {
    const { user: { id: userID } } = await makeUser(server, port)
    const user = await server.db.users.find({_id: userID})

    const { channelID } = await makeMessage(server, port)
    t.is(await util.getUnreadMessageCountInChannel(user, channelID), 1)

    await makeMessage(server, port, undefined, channelID)
    t.is(await util.getUnreadMessageCountInChannel(user, channelID), 2)

    await Promise.all(new Array(210).fill(0).map(() =>
      server.db.messages.insert({dateCreated: Date.now(), channelID})
    ))
    t.is(await util.getUnreadMessageCountInChannel(user, channelID), 200)
  })
})

test('getMentionsFromMessageContent', async t => {
  return testWithServer(portForCommonTests++, async ({ util, server, port }) => {
    const { user: { id: userID } } = await makeUser(server, port)

    t.deepEqual(await util.getMentionsFromMessageContent(`Hey, <@${userID}>!`), [userID])
    t.deepEqual(await util.getMentionsFromMessageContent(`Hey, <@1234>!`), [])
    t.deepEqual(await util.getMentionsFromMessageContent(`\`<@${userID}>\``), [])
  })
})
