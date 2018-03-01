const { test } = require('ava')
const { testWithServer, makeUser, makeAdmin, makeChannel, makeMessage } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiChannelTests = 29000

test('POST /api/channels', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { sessionID } = await makeAdmin(server, port)
    const response = await fetch(port, '/channels', {
      method: 'POST',
      body: JSON.stringify({
        sessionID, name: 'general'
      })
    })
    t.deepEqual(Object.keys(response), ['channelID'])
    t.is(typeof response.channelID, 'string')

    try {
      const { sessionID: sessionID2 } = await makeUser(server, port)
      await fetch(port, '/channels', {
        method: 'POST',
        body: JSON.stringify({
          sessionID: sessionID2, name: 'memes'
        })
      })
      t.fail('Could create channel without being an admin')
    } catch (error) {
      t.is(error.code, 'MUST_BE_ADMIN')
    }

    try {
      await fetch(port, '/channels', {
        method: 'POST',
        body: JSON.stringify({
          sessionID, name: 'general'
        })
      })
      t.fail('Could create a channel with an already-taken name')
    } catch (error) {
      t.is(error.code, 'NAME_ALREADY_TAKEN')
    }
  })
})

test('GET /api/channels', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { sessionID } = await makeAdmin(server, port)
    const { channelID } = await makeChannel(server, port, 'general', sessionID)

    const response = await fetch(port, '/channels')
    t.deepEqual(response, {
      channels: [
        {
          id: channelID,
          name: 'general'
        }
      ]
    })

    await makeMessage(server, port, undefined, channelID)

    const response2 = await fetch(port, '/channels?sessionID=' + sessionID)
    t.is(response2.channels[0].unreadMessageCount, 1)

    try {
      await fetch(port, '/channels?sessionID=a')
      t.fail('Could pass an invalid sessionID')
    } catch (error) {
      t.is(error.code, 'INVALID_SESSION_ID')
    }
  })
})

test('GET /api/channels/:id', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { channelID, sessionID } = await makeChannel(server, port, 'general')
    const response = await fetch(port, '/channels/' + channelID)
    t.deepEqual(response, {
      channel: {
        id: channelID,
        name: 'general'
      }
    })

    try {
      await fetch(port, '/channels/a')
      t.fail('Could get a channel that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }

    await makeMessage(server, port, undefined, channelID)

    const response2 = await fetch(port, `/channels/${channelID}?sessionID=${sessionID}`)
    t.is(response2.channel.unreadMessageCount, 1)

    try {
      await fetch(port, `/channels/${channelID}?sessionID=a`)
      t.fail('Could pass an invalid sessionID')
    } catch (error) {
      t.is(error.code, 'INVALID_SESSION_ID')
    }
  })
})

test('PATCH /api/channels/:id', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { channelID, sessionID } = await makeChannel(server, port, 'general')
    t.is((await server.db.channels.findOne({_id: channelID})).name, 'general')
    const response = await fetch(port, '/channels/' + channelID, {
      method: 'PATCH',
      body: JSON.stringify({
        sessionID, name: 'party-land'
      })
    })
    t.deepEqual(response, {})
    t.is((await server.db.channels.findOne({_id: channelID})).name, 'party-land')

    try {
      const { sessionID: sessionID2 } = await makeUser(server, port)
      await fetch(port, '/channels/' + channelID, {
        method: 'PATCH',
        body: JSON.stringify({
          sessionID: sessionID2, name: 'tic-tac'
        })
      })
      t.fail('Could rename channel without being an admin')
    } catch (error) {
      t.is(error.code, 'MUST_BE_ADMIN')
    }

    try {
      await fetch(port, '/channels/' + channelID, {
        method: 'PATCH',
        body: JSON.stringify({
          sessionID, name: 'very bad channel name #~#'
        })
      })
      t.fail('Could rename channel to invalid name')
    } catch (error) {
      t.is(error.code, 'INVALID_NAME')
    }
  })
})

test('DELETE /api/channels/:id', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { channelID: channelID1, sessionID } = await makeChannel(server, port, 'channel1')
    const { channelID: channelID2 } = await makeChannel(server, port, 'channel2', sessionID)
    t.is(await server.db.channels.count({}), 2)
    const response = await fetch(port, '/channels/' + channelID1, {
      method: 'DELETE',
      body: JSON.stringify({sessionID})
    })
    t.deepEqual(response, {})
    t.is(await server.db.channels.count({}), 1)

    try {
      await fetch(port, '/channels/' + channelID1, {
        method: 'DELETE',
        body: JSON.stringify({sessionID})
      })
      t.fail('Could delete channel that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }

    try {
      const { sessionID: sessionID2 } = await makeUser(server, port)
      await fetch(port, '/channels/' + channelID2, {
        method: 'DELETE',
        body: JSON.stringify({sessionID: sessionID2})
      })
      t.fail('Non-admin could delete channel')
    } catch (error) {
      t.is(error.code, 'MUST_BE_ADMIN')
    }
  })
})

test('POST /api/channels/:id/mark-read', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { sessionID } = await makeUser(server, port)
    const { channelID } = await makeMessage(server, port)
    const getCount = async () => {
      const { channel } = await fetch(port, `/channels/${channelID}?sessionID=${sessionID}`)
      return channel.unreadMessageCount
    }
    t.is(await getCount(), 1)
    const response = await fetch(port, `/channels/${channelID}/mark-read`, {
      method: 'POST',
      body: JSON.stringify({sessionID})
    })
    t.deepEqual(response, {})
    t.is(await getCount(), 0)
  })
})

test('GET /api/channels/:id/messages', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    // Reuse sessionID so we don't make a bunch of users.
    const { channelID, sessionID } = await makeChannel(server, port)
    const { messageID: messageID1 } = await makeMessage(server, port, 'First', channelID, sessionID)
    const { messageID: messageID2 } = await makeMessage(server, port, 'Second', channelID, sessionID)
    const { messageID: messageID3 } = await makeMessage(server, port, 'Third', channelID, sessionID)
    const { messageID: messageID4 } = await makeMessage(server, port, 'Fourth', channelID, sessionID)

    const response1 = await fetch(port, `/channels/${channelID}/messages`)
    t.deepEqual(Object.keys(response1), ['messages'])
    t.is(response1.messages.length, 4)
    t.is(response1.messages[0].text, 'First')
    t.is(response1.messages[1].text, 'Second')
    t.is(response1.messages[2].text, 'Third')
    t.is(response1.messages[3].text, 'Fourth')

    const response2 = await fetch(port, `/channels/${channelID}/messages?limit=2`)
    t.is(response2.messages.length, 2)
    t.is(response2.messages[0].text, 'Third')
    t.is(response2.messages[1].text, 'Fourth')

    const response3 = await fetch(port, `/channels/${channelID}/messages?before=${messageID3}`)
    t.is(response3.messages.length, 2)
    t.is(response3.messages[0].text, 'First')
    t.is(response3.messages[1].text, 'Second')

    const response4 = await fetch(port, `/channels/${channelID}/messages?after=${messageID1}`)
    t.is(response4.messages.length, 3)
    t.is(response4.messages[0].text, 'Second')
    t.is(response4.messages[1].text, 'Third')
    t.is(response4.messages[2].text, 'Fourth')

    const response5 = await fetch(port, `/channels/${channelID}/messages?before=${messageID4}&after=${messageID1}`)
    t.is(response5.messages.length, 2)
    t.is(response5.messages[0].text, 'Second')
    t.is(response5.messages[1].text, 'Third')

    const response6 = await fetch(port, `/channels/${channelID}/messages?before=${messageID4}&limit=2`)
    t.is(response6.messages.length, 2)
    t.is(response6.messages[0].text, 'Second')
    t.is(response6.messages[1].text, 'Third')

    const response7 = await fetch(port, `/channels/${channelID}/messages?after=${messageID1}&limit=2`)
    t.is(response7.messages.length, 2)
    t.is(response7.messages[0].text, 'Second')
    t.is(response7.messages[1].text, 'Third')

    const response8 = await fetch(port, `/channels/${channelID}/messages?before=${messageID4}&after=${messageID1}&limit=1`)
    t.is(response8.messages.length, 1)
    t.is(response8.messages[0].text, 'Second')

    const response9 = await fetch(port, `/channels/${channelID}/messages?before=${messageID1}`)
    t.is(response9.messages.length, 0)

    const response10 = await fetch(port, `/channels/${channelID}/messages?after=${messageID4}`)
    t.is(response10.messages.length, 0)

    const response11 = await fetch(port, `/channels/${channelID}/messages?limit=0`)
    t.is(response11.messages.length, 1)

    const { channelID: channelID2 } = await makeChannel(server, port, 'channel2', sessionID)
    for (let i = 0; i < 55; i++) {
      await makeMessage(server, port, 'Message ' + i, channelID2, sessionID)
    }

    const response12 = await fetch(port, `/channels/${channelID2}/messages`)
    t.is(response12.messages.length, 50)
    t.is(response12.messages[49].text, 'Message ' + 54)
    t.is(response12.messages[0].text, 'Message ' + 5)

    const response13 = await fetch(port, `/channels/${channelID2}/messages?limit=55`)
    t.is(response13.messages.length, 50)
  })
})

test('POST /api/channels/:id/pins', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { channelID, sessionID } = await makeChannel(server, port)
    const { messageID } = await makeMessage(server, port, undefined, channelID)

    const response = await fetch(port, `/channels/${channelID}/pins`, {
      method: 'POST',
      body: JSON.stringify({sessionID, messageID})
    })
    t.deepEqual(response, {})
    t.deepEqual((await server.db.channels.findOne({_id: channelID})).pinnedMessageIDs, [messageID])

    try {
      await fetch(port, `/channels/${channelID}/pins`, {
        method: 'POST',
        body: JSON.stringify({sessionID, messageID})
      })
      t.fail('Could pin an already-pinned message')
    } catch (error) {
      t.is(error.code, 'ALREADY_PERFORMED')
    }

    const { channelID: channelID2 } = await makeChannel(server, port, undefined, sessionID)
    const { messageID: messageID2 } = await makeMessage(server, port, undefined, channelID2)

    try {
      await fetch(port, `/channels/${channelID}/pins`, {
        method: 'POST',
        body: JSON.stringify({
          sessionID, messageID: messageID2
        })
      })
      t.fail('Could pin a message from another channel')
    } catch (error) {
      t.is(error.code, 'NOT_FROM_SAME_CHANNEL')
    }

    try {
      const { sessionID: sessionID2 } = await makeUser(server, port)
      await fetch(port, `/channels/${channelID2}/pins`, {
        method: 'POST',
        body: JSON.stringify({
          sessionID: sessionID2, messageID: messageID2
        })
      })
      t.fail('Could pin a message as a non-admin')
    } catch (error) {
      t.is(error.code, 'MUST_BE_ADMIN')
    }
  })
})

test('DELETE /api/channels/:channelID/pins/:messageID', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { channelID, sessionID } = await makeChannel(server, port)
    const { messageID } = await makeMessage(server, port, undefined, channelID)

    await fetch(port, `/channels/${channelID}/pins`, {
      method: 'POST',
      body: JSON.stringify({sessionID, messageID})
    })

    await fetch(port, `/channels/${channelID}/pins/${messageID}`, {
      method: 'DELETE',
      body: JSON.stringify({sessionID})
    })

    const { pins } = await fetch(port, `/channels/${channelID}/pins`, {
      method: 'GET',
      headers: {
        'X-Session-ID': sessionID,
      }
    })

    t.is(pins.length, 0)
  })
})

test('GET /api/channels/:id/pins', t => {
  return testWithServer(portForApiChannelTests++, async ({ server, port }) => {
    const { channelID, sessionID } = await makeChannel(server, port)

    const response = await fetch(port, `/channels/${channelID}/pins`)
    t.deepEqual(response, {
      pins: []
    })

    const { messageID: messageID1 } = await makeMessage(server, port, 'Hello!', channelID, sessionID)
    const { messageID: messageID2 } = await makeMessage(server, port, 'Goodbye!', channelID, sessionID)
    for (const id of [messageID1, messageID2]) {
      await fetch(port, `/channels/${channelID}/pins`, {
        method: 'POST',
        body: JSON.stringify({
          sessionID, messageID: id
        })
      })
    }

    const response2 = await fetch(port, `/channels/${channelID}/pins`)
    t.is(response2.pins.length, 2)
    t.is(response2.pins[0].text, 'Hello!')
    t.is(response2.pins[1].text, 'Goodbye!')

    await fetch(port, `/messages/${messageID1}`, {
      method: 'DELETE',
      body: JSON.stringify({sessionID})
    })

    const response3 = await fetch(port, `/channels/${channelID}/pins`)
    t.is(response3.pins.length, 1)
    t.is(response3.pins[0].text, 'Goodbye!')
  })
})
