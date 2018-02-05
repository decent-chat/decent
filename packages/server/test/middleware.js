const { test } = require('ava')
const { makeMiddleware, validate } = require('../middleware')
const { makeUser, makeAdmin } = require('./_serverUtil')
const spawn = require('./_spawn')
const fetch = require('./_fetch')
const Datastore = require('nedb')

let portForMiddlewareTests = 22000

function interpretMiddlewareHelper(request, response, middleware) {
  if (middleware.length) {
    middleware[0](request, response, () => {
      interpretMiddlewareHelper(request, response, middleware.slice(1))
    })
  }
}

async function interpretMiddleware(request, middleware) {
  const response = {
    wasEnded: false,
    endData: null,
    statusCode: null,

    status: function(statusCode) {
      response.statusCode = statusCode
      return response
    },

    end: function(data) {
      response.wasEnded = true
      response.endData = JSON.parse(data)
      return response
    },

    json: function(obj) {
      return response.end(JSON.stringify(obj))
    }
  }

  await new Promise(resolve => {
    const oldEnd = response.end
    response.end = function(data) {
      oldEnd(data)
      resolve()
    }

    interpretMiddlewareHelper(request, response, middleware.concat([resolve]))
  })

  return {request, response}
}

test('structure of makeMiddleware', t => {
  t.is(typeof makeMiddleware, 'function')
  const db = new Datastore()
  const ret = makeMiddleware({db})
  t.is(typeof ret, 'object')
  t.is(typeof ret.util, 'object')
})

test('interpretMiddlewareHelper', async t => {
  const request = {}, response = {}
  await new Promise(resolve => interpretMiddlewareHelper(request, response, [
    function(req, res, next) {
      setTimeout(() => {
        req.n = 2
        next()
      }, 150)
    },
    function(req, res, next) {
      req.n *= 4
      next()
    },
    resolve
  ]))
  t.is(request.n, 8)
})

test('interpretMiddleware - basic usage', async t => {
  const request = {}
  await interpretMiddleware(request, [
    function(req, res, next) {
      setTimeout(() => {
        req.n = 2
        next()
      }, 150)
    },
    function(req, res, next) {
      req.n *= 4
      next()
    }
  ])
  t.is(request.n, 8)
})

test('interpretMiddleware - response.status.json', async t => {
  const request = {}
  const { response } = await interpretMiddleware(request, [
    function(req, res, next) {
      res.status(200).json({x: 123})
    }
  ])
  t.true(response.wasEnded)
  t.is(response.statusCode, 200)
  t.deepEqual(response.endData, {x: 123})
})

test('verifyVarsExists', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {}
  await interpretMiddleware(request, middleware.verifyVarsExists())
  t.is(typeof request[middleware.vars], 'object')
})

test('loadVarFromBody - basic usage', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {body: {x: 25}}
  await interpretMiddleware(request, middleware.loadVarFromBody('x'))
  t.is(request[middleware.vars]['x'], 25)
})

test('loadVarFromBody - missing variable, required = true', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {body: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromBody('y'))
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(request[middleware.vars].y, undefined)
})

test('loadVarFromBody - missing variable, required = false', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {body: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromBody('y', false))
  t.false(response.wasEnded)
  t.is(request[middleware.vars].y, undefined)
})

test('loadVarFromQuery - basic usage', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {query: {x: 25}}
  await interpretMiddleware(request, middleware.loadVarFromQuery('x'))
  t.is(request[middleware.vars]['x'], 25)
})

test('loadVarFromQuery - missing variable, required = true', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {query: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromQuery('y'))
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INCOMPLETE_PARAMETERS')
  t.is(request[middleware.vars].y, undefined)
})

test('loadVarFromQuery - missing variable, required = false', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {query: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromQuery('y', false))
  t.false(response.wasEnded)
  t.is(request[middleware.vars].y, undefined)
})

// There are no tests for variables missing from the params object, since Express
// won't even call this middleware function if any parameters are missing (since
// it wouldn't be the same route).
test('loadVarFromParams', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {params: {x: 25}}
  await interpretMiddleware(request, middleware.loadVarFromParams('x'))
  t.is(request[middleware.vars]['x'], 25)
})

test('validate.string', t => {
  t.true(validate.string('hello'))
  t.false(validate.string(123))
  t.false(validate.string())
})

test('validateVar - test data is valid', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {[middleware.vars]: {x: 'hello'}}
  const { response } = await interpretMiddleware(request, middleware.validateVar('x', validate.string))
  t.false(response.wasEnded)
})

test('validateVar - test data is invalid', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {[middleware.vars]: {x: 123}}
  const { response } = await interpretMiddleware(request, middleware.validateVar('x', validate.string))
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
})

test('runIfVarExists - var does exist', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {[middleware.vars]: {x: 25}}
  await interpretMiddleware(request,
    middleware.runIfVarExists('x', [
      function(req, res, next) {
        req[middleware.vars].x *= 5
        next()
      }
    ])
  )
  t.is(request[middleware.vars].x, 125)
})

test('runIfVarExists - var does not exist', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {[middleware.vars]: {y: 'hello'}}
  await interpretMiddleware(request,
    middleware.runIfVarExists('x', [
      function(req, res, next) {
        req[middleware.vars].z = 'flamingo'
      }
    ])
  )
  t.is(request[middleware.vars].z, undefined)
})

test('runIfCondition - basic if/else usage, condition is true', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {}
  await interpretMiddleware(request,
    middleware.runIfCondition(() => true, [
      function(req, res, next) {
        req.wasTrue = true
        next()
      }
    ], [
      function(req, res, next) {
        req.wasFalse = true
        next()
      }
    ])
  )
  t.true(request.wasTrue)
  t.is(request.wasFalse, undefined)
})

test('runIfCondition - basic if/else usage, condition is false', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {}
  await interpretMiddleware(request,
    middleware.runIfCondition(() => false, [
      function(req, res, next) {
        req.wasTrue = true
        next()
      }
    ], [
      function(req, res, next) {
        req.wasFalse = true
        next()
      }
    ])
  )
  t.true(request.wasFalse)
  t.is(request.wasTrue, undefined)
})

test('runIfCondition - condition function only called once', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {}
  let timesCalled = 0, wasTrue = 0, wasFalse = 0
  await interpretMiddleware(request,
    middleware.runIfCondition(() => {
      timesCalled++
      // Should be true: 1 % 2 === 1.
      return timesCalled % 2 === 1
    }, [
      function(req, res, next) { wasTrue++; next() },
      function(req, res, next) { wasTrue++; next() }
    ], [
      function(req, res, next) { wasFalse++; next() },
      function(req, res, next) { wasFalse++; next() }
    ])
  )
  t.is(timesCalled, 1)
  t.is(wasTrue, 2)
  t.is(wasFalse, 0)
})

test('runIfCondition - request variables should not be polluted', async t => {
  const db = new Datastore()
  const { middleware } = makeMiddleware({db})

  const request = {}
  await interpretMiddleware(request,
    middleware.runIfCondition(() => true, [
      function(req, res, next) { next() }
    ])
  )
  t.deepEqual(Object.getOwnPropertySymbols(request[middleware.vars]), [])
})

test('getSessionUserFromID - basic functionality', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const { user, sessionID } = await makeUser(server, port)
  const request = {[middleware.vars]: {sessionID}}
  await interpretMiddleware(request,
    middleware.getSessionUserFromID('sessionID', 'user')
  )
  t.is(request[middleware.vars].user._id, user.id)

  await server.kill()
})

test('getSessionUserFromID - non-string sessionID', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const request = {[middleware.vars]: {sessionID: 123}}
  const { response } = await interpretMiddleware(request,
    middleware.getSessionUserFromID('sessionID', 'user')
  )
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
  t.is(request[middleware.vars].user, undefined)

  await server.kill()
})

test('getSessionUserFromID - sessionID for nonexistent session', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const request = {[middleware.vars]: {sessionID: 'a'}}
  const { response } = await interpretMiddleware(request,
    middleware.getSessionUserFromID('sessionID', 'user')
  )
  t.true(response.wasEnded)
  t.is(response.statusCode, 401)
  t.is(response.endData.error.code, 'INVALID_SESSION_ID')
  t.is(request[middleware.vars].user, undefined)

  await server.kill()
})

test('getUserFromUsername - basic functionality', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const { user } = await makeUser(server, port, 'johndoe')
  const request = {[middleware.vars]: {username: 'johndoe'}}
  await interpretMiddleware(request,
    middleware.getUserFromUsername('username', 'user')
  )
  t.is(request[middleware.vars].user._id, user.id)

  await server.kill()
})

test('getUserFromUsername - non-string username', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const request = {[middleware.vars]: {username: 9999}}
  const { response } = await interpretMiddleware(request,
    middleware.getUserFromUsername('username', 'user')
  )
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
  t.is(request[middleware.vars].user, undefined)

  await server.kill()
})

test('getUserFromUsername - username of nonexistent user', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const request = {[middleware.vars]: {username: 'counterfeitcharlie'}}
  const { response } = await interpretMiddleware(request,
    middleware.getUserFromUsername('username', 'user')
  )
  t.true(response.wasEnded)
  t.is(response.statusCode, 404)
  t.is(response.endData.error.code, 'NOT_FOUND')
  t.is(request[middleware.vars].user, undefined)

  await server.kill()
})

test('getUserFromID - basic functionality', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const { user } = await makeUser(server, port)
  const request = {[middleware.vars]: {userID: user.id}}
  await interpretMiddleware(request,
    middleware.getUserFromID('userID', 'user')
  )
  t.is(request[middleware.vars].user._id, user.id)

  await server.kill()
})

test('getUserFromID - non-string userID', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const request = {[middleware.vars]: {userID: 7370}}
  const { response } = await interpretMiddleware(request,
    middleware.getUserFromID('userID', 'user')
  )
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
  t.is(request[middleware.vars].user, undefined)

  await server.kill()
})

test('getUserFromID - id of nonexistent user', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  const request = {[middleware.vars]: {userID: 'a'}}
  const { response } = await interpretMiddleware(request,
    middleware.getUserFromID('userID', 'user')
  )
  t.true(response.wasEnded)
  t.is(response.statusCode, 404)
  t.is(response.endData.error.code, 'NOT_FOUND')
  t.is(request[middleware.vars].user, undefined)

  await server.kill()
})

test('getMessageFromID - basic functionality', async t => {
  const port = portForMiddlewareTests++
  const server = await spawn(port)
  const { middleware } = makeMiddleware({db: server.db})

  // TODO: Make a function to quickly generate an admin, channel, and message.
  // This would be helpful in lots of future tests (as well as here).

  const { sessionID } = await makeAdmin(server, port)

  const { channelID } = await fetch(port, '/channels', {
    method: 'POST',
    body: JSON.stringify({
      name: 'general', sessionID
    })
  })

  const { messageID } = await fetch(port, '/messages', {
    method: 'POST',
    body: JSON.stringify({
      channelID, text: 'Hello, world!', sessionID
    })
  })

  const request = {[middleware.vars]: {messageID}}
  await interpretMiddleware(request,
    middleware.getMessageFromID('messageID', 'message')
  )
  t.is(request[middleware.vars].message._id, messageID)
  t.is(request[middleware.vars].message.text, 'Hello, world!')

  await server.kill()
})
