const { test } = require('ava')
const { testWithServer, makeUserWithPermissions } = require('./_serverUtil')
const fetch = require('./_fetch')
const nodeFetch = require('node-fetch')

let portForApiEmoteTests = 27000

test('POST /api/emotes', t => {
  return testWithServer(portForApiEmoteTests++, async ({ server, port }) => {
    const { sessionID: emoterSID } = await makeUserWithPermissions(server, port, {manageEmotes: true})

    t.is(await server.db.emotes.count({}), 0)
    await fetch(port, '/emotes', {
      method: 'POST',
      body: JSON.stringify({
        shortcode: 'shipit',
        imageURL: '/img/shipit.png',
        sessionID: emoterSID
      })
    })
    t.is(await server.db.emotes.count({}), 1)

    try {
      const { sessionID: userSID } = await makeUserWithPermissions(server, port, {manageEmotes: false})
      await fetch(port, '/emotes', {
        method: 'POST',
        body: JSON.stringify({
          shortcode: 'lol',
          imageURL: '/img/lol.png',
          sessionID: userSID
        })
      })
      t.fail('Could create emote without manageEmotes permission')
    } catch (error) {
      t.is(error.code, 'NOT_ALLOWED')
      t.is(error.missingPermission, 'manageEmotes')
      t.is(await server.db.emotes.count({}), 1) // Make sure it wasn't created!
    }

    try {
      await fetch(port, '/emotes', {
        method: 'POST',
        body: JSON.stringify({
          shortcode: 'shipit',
          imageURL: '/img/shipit.png',
          sessionID: emoterSID
        })
      })
      t.fail('Could create emote with an already-taken name')
    } catch (error) {
      t.is(error.code, 'NAME_ALREADY_TAKEN')
      t.is(await server.db.emotes.count({}), 1)
    }
  })
})

test('DELETE /api/emotes/:shortcode', t => {
  return testWithServer(portForApiEmoteTests++, async ({ server, port }) => {
    const { sessionID: emoterSID } = await makeUserWithPermissions(server, port, {manageEmotes: true})

    await fetch(port, '/emotes', {
      method: 'POST',
      body: JSON.stringify({
        shortcode: 'shipit',
        imageURL: '/img/shipit.png',
        sessionID: emoterSID
      })
    })
    t.is(await server.db.emotes.count({}), 1)

    await fetch(port, '/emotes/shipit', {
      method: 'DELETE',
      body: JSON.stringify({sessionID: emoterSID})
    })
    t.is(await server.db.emotes.count({}), 0)

    try {
      await fetch(port, '/emotes/a', {
        method: 'DELETE',
        body: JSON.stringify({sessionID: emoterSID})
      })
      t.fail('Could delete emote that does not exist')
    } catch (error) {
      t.is(error.code, 'NOT_FOUND')
    }

    // Create the emote again for the next test:
    await fetch(port, '/emotes', {
      method: 'POST',
      body: JSON.stringify({
        shortcode: 'shipit',
        imageURL: '/img/shipit.png',
        sessionID: emoterSID
      })
    })

    try {
      const { sessionID: userSID } = await makeUserWithPermissions(server, port, {manageEmotes: false})
      await fetch(port, '/emotes/a', {
        method: 'DELETE',
        body: JSON.stringify({sessionID: userSID})
      })
      t.fail('Could delete emote without manageEmotes permission')
    } catch (error) {
      t.is(error.code, 'NOT_ALLOWED')
      t.is(error.missingPermission, 'manageEmotes')
      t.is(await server.db.emotes.count({}), 1) // Make sure it wasn't deleted!
    }
  })
})

test('GET /api/emotes', t => {
  return testWithServer(portForApiEmoteTests++, async ({ server, port }) => {
    const { sessionID: emoterSID } = await makeUserWithPermissions(server, port, {manageEmotes: true})
    for (let i = 0; i < 2; i++) {
      await fetch(port, '/emotes', {
        method: 'POST',
        body: JSON.stringify({
          shortcode: 'shipit' + i,
          imageURL: '/img/shipit.png',
          sessionID: emoterSID
        })
      })
    }

    const result = await fetch(port, '/emotes')
    t.deepEqual(result, {
      emotes: [
        {shortcode: 'shipit0', imageURL: '/img/shipit.png'},
        {shortcode: 'shipit1', imageURL: '/img/shipit.png'}
      ]
    })
  })
})

test('GET /api/emotes/:shortcode', t => {
  return testWithServer(portForApiEmoteTests++, async ({ server, port }) => {
    const { sessionID: emoterSID } = await makeUserWithPermissions(server, port, {manageEmotes: true})
    await fetch(port, '/emotes', {
      method: 'POST',
      body: JSON.stringify({
        shortcode: 'shipit',
        imageURL: '/img/shipit.png',
        sessionID: emoterSID
      })
    })

    const response = await nodeFetch(`http://localhost:${port}/api/emotes/shipit`, {
      redirect: 'manual'
    })
    t.is(response.headers.get('location'), `http://localhost:${port}/img/shipit.png`)
  })
})
