const { test } = require('ava')
const { makeMiddleware } = require('../middleware')
const { testWithServer, makeUser, makeChannel, makeMessage } = require('./_serverUtil')
const makeSerializers = require('../serialize')

let portForSerializeTests = 23000

test('serialize.message', t => {
  return testWithServer(portForSerializeTests++, async ({ serialize }) => {
    const date = Date.now(), editDate = date - 5000
    const reactions = {} // TODO: Actually check how reactions are serialized.

    const message = {
      _id: '123',
      authorID: '234',
      authorUsername: 'jen',
      authorFlair: 'spooks',
      type: 'user',
      text: 'Hello!',
      date, editDate,
      channelID: '345',
      reactions
    }

    const serialized = await serialize.message(message)

    t.deepEqual(Object.keys(serialized), ['id', 'authorUsername', 'authorID', 'authorFlair', 'authorAvatarURL', 'type', 'text', 'date', 'editDate', 'channelID', 'reactions', 'mentionedUserIDs'])
    t.is(serialized.id, '123')
    t.is(serialized.authorUsername, 'jen')
    t.is(serialized.authorID, '234')
    t.is(serialized.authorFlair, 'spooks')
    t.is(typeof serialized.authorAvatarURL, 'string')
    t.is(serialized.type, 'user')
    t.is(serialized.text, 'Hello!')
    t.is(serialized.date, date)
    t.is(serialized.editDate, editDate)
    t.is(serialized.channelID, '345')
    t.deepEqual(serialized.mentionedUserIDs, [])
    t.deepEqual(serialized.reactions, reactions)

    const message2 = Object.assign({}, message)
    delete message2.editDate

    const serialized2 = await serialize.message(message2)

    t.is(serialized2.editDate, undefined)
  })
})

test('serialize.user', t => {
  // Users are more complicated to test because the "online" property is based
  // on the connected sockets map (which we mock here).

  return testWithServer(portForSerializeTests++, async ({ serialize, connectedSocketsMap, server }) => {
    const user = {
      _id: 'user1',
      username: 'user',
      passwordHash: 'hash',
      salt: 'salt',
      email: 'user1@nonfree.news',
      permissionLevel: 'member',
      authorized: true,
      lastReadChannelDates: {}
    }

    const serialized = await serialize.user(user)
    const baseProperties = ['id', 'username', 'flair', 'avatarURL', 'permissionLevel', 'online', 'mentions']
    t.deepEqual(Object.keys(serialized), baseProperties)
    t.is(serialized.id, 'user1')
    t.is(serialized.username, 'user')
    t.is(typeof serialized.avatarURL, 'string')
    t.is(serialized.permissionLevel, 'member')
    t.false(serialized.online)

    const fakeSocket = {}
    connectedSocketsMap.set(fakeSocket, {
      userID: 'user1', isAlive: true
    })

    const serialized2 = await serialize.user(user)
    t.true(serialized2.online)

    const sessionUser = Object.assign({}, user)
    const serialized3 = await serialize.user(user, sessionUser)
    t.deepEqual(Object.keys(serialized3), baseProperties.concat(['email']))
    t.is(serialized3.email, 'user1@nonfree.news')

    await server.settings.setSetting(server.db.settings, server.settings.serverPropertiesID, 'requireAuthorization', 'on')
    const serialized4 = await serialize.user(user, sessionUser)
    t.deepEqual(Object.keys(serialized4), baseProperties.concat(['email', 'authorized']))
    t.true(serialized4.authorized)
  })
})

test('serialize.session', t => {
  return testWithServer(portForSerializeTests++, async ({ serialize, server, port }) => {
    const { user, sessionID } = await makeUser(server, port)

    const dateCreated = Date.now()
    const session = {_id: sessionID, dateCreated, userID: user._id}
    const serialized = await serialize.session(session)

    t.deepEqual(Object.keys(serialized), ['id', 'dateCreated'])
    t.is(serialized.id, sessionID)
    t.is(serialized.dateCreated, dateCreated)
  })
})

test('serialize.channel', t => {
  return testWithServer(portForSerializeTests++, async ({ serialize, server, port }) => {
    const { channelID } = await makeChannel(server, port, 'general')

    const channel = {
      _id: channelID,
      name: 'general',
      pinnedMessageIDs: []
    }

    const serialized = await serialize.channel(channel)
    t.deepEqual(Object.keys(serialized), ['id', 'name'])
    t.is(serialized.id, channelID)
    t.is(serialized.name, 'general')

    // serialize.channel responds unread message count when passed a session user.
    const { messageID: msg1 } = await makeMessage(server, port, 'Hello.', channelID)
    const { messageID: msg2 } = await makeMessage(server, port, 'Hello.', channelID)
    const user = await makeUser(server, port)
    const serialized2 = await serialize.channel(channel, user)
    t.deepEqual(Object.keys(serialized2), ['id', 'name', 'unreadMessageCount', 'oldestUnreadMessageID'])
    t.is(serialized2.unreadMessageCount, 2)
  })
})

test('serialize.emote', t => {
  return testWithServer(portForSerializeTests++, async ({ serialize }) => {
    const emote = {
      _id: 'a',
      shortcode: 'shipit',
      imageURL: '/img/shipit.png'
    }

    const serialized = await serialize.emote(emote)
    t.deepEqual(Object.keys(serialized), ['shortcode', 'imageURL'])
    t.is(serialized.shortcode, 'shipit')
    t.is(serialized.imageURL, '/img/shipit.png')
  })
})
