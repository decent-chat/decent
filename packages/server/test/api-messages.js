const { test } = require('ava')
const { makeChannel, makeMessage, makeUser, makeUserWithPermissions, testWithServer } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForApiMessageTests = 26000

test('POST /api/messages', t => {
  return testWithServer(portForApiMessageTests++, async ({ server, port }) => {
    const { channelID } = await makeChannel(server, port)
    const { sessionID: senderSID } = await makeUserWithPermissions(server, port, {sendMessages: true})

    const response = await fetch(port, '/messages', {
      method: 'POST',
      body: JSON.stringify({
        channelID, sessionID: senderSID,
        text: 'Hello, world!'
      })
    })

    t.deepEqual(Object.keys(response), ['messageID'])
    t.is(typeof response.messageID, 'string')

    try {
      await fetch(port, '/messages', {
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

    const { sessionID: noSenderSID } = await makeUserWithPermissions(server, port, {sendMessages: false})
    try {
      await fetch(port, '/messages', {
        method: 'POST',
        body: JSON.stringify({
          channelID, sessionID: noSenderSID,
          text: 'Spam.'
        })
      })
      t.fail('Could post without sendMessages permission')
    } catch (error) {
      t.is(error.code, 'NOT_ALLOWED')
      t.is(error.missingPermission, 'sendMessages')
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
    t.is(messageOld.dateEdited, null)

    const response = await fetch(port, '/messages/' + messageID, {
      method: 'PATCH',
      body: JSON.stringify({
        sessionID, text: 'goodbye'
      })
    })
    t.deepEqual(response, {})

    const { message: messageNew } = await fetch(port, '/messages/' + messageID)
    t.is(messageNew.text, 'goodbye')
    t.is(typeof messageNew.dateEdited, 'number')

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

    // This message will be made by a new user, since we aren't passing in any
    // session ID. That's important because we want to test that one user can't
    // delete am essage by another user!
    const { messageID: messageID2 } = await makeMessage(server, port)
    try {
      await fetch(port, '/messages/' + messageID2, {
        method: 'DELETE',
        body: JSON.stringify({sessionID})
      })
      t.fail('Could delete a message made by another user')
    } catch (error) {
      t.is(error.code, 'NOT_YOURS')
    }

    // Users with deleteMessages should be able to delete any message, regardless
    // of who made the message.
    const { sessionID: deleterSID } = await makeUserWithPermissions(server, port, {deleteMessages: true})
    await fetch(port, '/messages/' + messageID2, {
      method: 'DELETE',
      body: JSON.stringify({sessionID: deleterSID})
    })
  })
})
