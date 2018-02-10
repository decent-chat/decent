const { test } = require('ava')
const { makeChannel, makeMessage, makeUser, makeAdmin, testWithServer } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiMessageTests = 26000

test('POST /api/messages', t => {
  return testWithServer(portForApiMessageTests++, async ({ server, port }) => {
    const { channelID } = await makeChannel(server, port)
    const { sessionID } = await makeUser(server, port)

    const response = await fetch(port, '/messages', {
      method: 'POST',
      body: JSON.stringify({
        channelID, sessionID,
        text: 'Hello, world!'
      })
    })

    t.deepEqual(Object.keys(response), ['messageID'])
    t.is(typeof response.messageID, 'string')

    try {
      await fetch(port, '/messages/', {
        method: 'POST',
        body: JSON.stringify({
          channelID, text: 'Hello, world!'
        })
      })
      t.fail('Could post without passing session ID')
    } catch (error) {
      t.is(error.code, 'INCOMPLETE_PARAMETERS')
      t.is(error.missing, 'sessionID')
    }
  })
})

test('GET /api/messages/:id', t => {
  return testWithServer(portForApiMessageTests++, async ({ server, port }) => {
    const { messageID } = await makeMessage(server, port, 'abcd')
    const response = await fetch(port, '/messages/' + messageID)
    t.deepEqual(Object.keys(response), ['message'])
    t.is(response.message.id, messageID)
    t.is(response.message.text, 'abcd')
  })
})

test('PATCH /api/messages/:id', t => {
  return testWithServer(portForApiMessageTests++, async ({ server, port }) => {
    const { messageID, sessionID } = await makeMessage(server, port, 'hello')

    const { message: messageOld } = await fetch(port, '/messages/' + messageID)
    t.is(messageOld.text, 'hello')
    t.is(messageOld.editDate, null)

    const response = await fetch(port, '/messages/' + messageID, {
      method: 'PATCH',
      body: JSON.stringify({
        sessionID, text: 'goodbye'
      })
    })
    t.deepEqual(response, {})

    const { message: messageNew } = await fetch(port, '/messages/' + messageID)
    t.is(messageNew.text, 'goodbye')
    t.is(typeof messageNew.editDate, 'number')

    const { sessionID: sessionID2 } = await makeUser(server, port)
    try {
      await fetch(port, '/messages/' + messageID, {
        method: 'PATCH',
        body: JSON.stringify({
          sessionID: sessionID2,
          text: 'bam'
        })
      })
      t.fail('Could edit a message made by another user')
    } catch (error) {
      t.is(error.code, 'NOT_YOURS')
    }

    // Admins shouldn't be able to edit messages they don't own, either!
    const { sessionID: sessionID3 } = await makeAdmin(server, port)
    try {
      await fetch(port, '/messages/' + messageID, {
        method: 'PATCH',
        body: JSON.stringify({
          sessionID: sessionID2,
          text: 'bam'
        })
      })
      t.fail('Admin could edit a message made by another user (should not be able to!)')
    } catch (error) {
      t.is(error.code, 'NOT_YOURS')
    }
  })
})

test('DELETE /api/messages/:id', t => {
  return testWithServer(portForApiMessageTests++, async ({ server, port }) => {
    const { messageID, sessionID } = await makeMessage(server, port)
    t.not(await server.db.messages.findOne({_id: messageID}), null)

    await fetch(port, '/messages/' + messageID, {
      method: 'DELETE',
      body: JSON.stringify({sessionID})
    })
    t.is(await server.db.messages.findOne({_id: messageID}), null)

    try {
      await fetch(port, '/messages/a', {
        method: 'DELETE',
        body: JSON.stringify({sessionID})
      })
      t.fail('Could delete a message that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }

    const { messageID: messageID2, sessionID: sessionID2 } = await makeMessage(server, port)
    try {
      await fetch(port, '/messages/' + messageID2, {
        method: 'DELETE',
        body: JSON.stringify({sessionID})
      })
      t.fail('Could delete a message made by another user')
    } catch (error) {
      t.is(error.code, 'NOT_YOURS')
    }

    // Admins should be able to delete any message.
    const { sessionID: adminSessionID } = await makeAdmin(server, port)
    await fetch(port, '/messages/' + messageID2, {
      method: 'DELETE',
      body: JSON.stringify({sessionID: adminSessionID})
    })
  })
})
