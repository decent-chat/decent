const { test } = require('ava')
const { testWithServer, makeUser, makeMessage } = require('./_serverUtil')

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
