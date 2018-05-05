const { test } = require('ava')
const { makeMiddleware, validate } = require('../middleware')
const makeCommonUtils = require('../common')
const { testWithServer, makeUser, makeRole, giveOwnerRole, makeChannel, makeMessage } = require('./_serverUtil')
const fetch = require('./_fetch')

let portForMiddlewareTests = 22000

function quickMakeServerlessMiddleware() {
  const util = makeCommonUtils({})
  const middleware = makeMiddleware({util})
  return {util, middleware}
}

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
  const { middleware } = quickMakeServerlessMiddleware()
  t.is(typeof middleware, 'object')
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
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {}
  await interpretMiddleware(request, middleware.verifyVarsExists())
  t.is(typeof request[middleware.vars], 'object')
})

test('loadVarFromBody - basic usage', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {body: {x: 25}}
  await interpretMiddleware(request, middleware.loadVarFromBody('x'))
  t.is(request[middleware.vars]['x'], 25)
})

test('loadVarFromBody - missing variable, required = true', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {body: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromBody('y'))
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(request[middleware.vars].y, undefined)
})

test('loadVarFromBody - missing variable, required = false', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {body: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromBody('y', false))
  t.false(response.wasEnded)
  t.is(request[middleware.vars].y, undefined)
})

test('loadVarFromQuery - basic usage', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {query: {x: 25}}
  await interpretMiddleware(request, middleware.loadVarFromQuery('x'))
  t.is(request[middleware.vars]['x'], 25)
})

test('loadVarFromQuery - missing variable, required = true', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {query: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromQuery('y'))
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INCOMPLETE_PARAMETERS')
  t.is(request[middleware.vars].y, undefined)
})

test('loadVarFromQuery - missing variable, required = false', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {query: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromQuery('y', false))
  t.false(response.wasEnded)
  t.is(request[middleware.vars].y, undefined)
})

test('loadVarFromQueryOrBody - basic usage', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const queryRequest = {query: {x: 25}}
  await interpretMiddleware(queryRequest, middleware.loadVarFromQueryOrBody('x'))
  t.is(queryRequest[middleware.vars]['x'], 25)

  const bodyRequest = {body: {x: 25}}
  await interpretMiddleware(bodyRequest, middleware.loadVarFromQueryOrBody('x'))
  t.is(bodyRequest[middleware.vars]['x'], 25)
})

test('loadVarFromQueryOrBody - body gets priority over query', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {
    query: {x: 'via query'},
    body:  {x: 'via body'}
  }

  await interpretMiddleware(request, middleware.loadVarFromQueryOrBody('x'))
  t.is(request[middleware.vars]['x'], 'via body')
})

test('loadVarFromQueryOrBody - missing variable, required = true', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {query: {x: 25}, body: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromQueryOrBody('y'))
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INCOMPLETE_PARAMETERS')
  t.is(request[middleware.vars].y, undefined)
})

test('loadVarFromQueryOrBody - missing variable, required = false', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {query: {x: 25}, body: {x: 25}}
  const { response } = await interpretMiddleware(request, middleware.loadVarFromQueryOrBody('y', false))
  t.false(response.wasEnded)
  t.is(request[middleware.vars].y, undefined)
})

// There are no tests for variables missing from the params object, since Express
// won't even call this middleware function if any parameters are missing (since
// it wouldn't be the same route).
test('loadVarFromParams', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {params: {x: 25}}
  await interpretMiddleware(request, middleware.loadVarFromParams('x'))
  t.is(request[middleware.vars]['x'], 25)
})

test('validate.string', t => {
  t.true(validate.string('hello'))
  t.true(validate.string(''))
  t.false(validate.string(123))
  t.false(validate.string())
})

test('validate.nonEmptyString', t => {
  const val = validate.nonEmptyString
  t.true(val('hello'))
  t.false(val(''))
  t.false(val(123))
  t.false(val())
})

test('validate.object', t => {
  t.true(validate.object({}))
  t.false(validate.object(123))
  t.false(validate.object())
  t.false(validate.object([]))
})

test('validate.roleName', t => {
  t.true(validate.roleName('boop'))
  t.false(validate.roleName(''))
  t.false(validate.roleName('boooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooop'))
  t.false(validate.roleName(5000))
})

test('validate.permissionsObject', t => {
  const val = validate.permissionsObject
  t.true(val({readMessages: true}))
  t.true(val({readMessages: false}))
  t.true(val({readMessages: null}))
  t.true(val({readMessages: undefined}))
  t.true(val({}))
  t.false(val({readMessages: 'sure'}))
  t.false(val({yourFACE: null}))
  t.false(val('lol'))
})

test('validate.arrayOfRoleIDs', async t => {
  const db = {
    roles: {
      findOne: async ({ _id }) => {
        return ['a', 'b', 'c'].includes(_id) ? {} : null
      }
    }
  }

  const val = x => validate.arrayOfRoleIDs(x, {db})
  t.true(await val(['a', 'b', 'c']))
  t.true(await val(['a', 'c']))
  t.true(await val([]))
  t.false(await val(['x']))
  t.false(await val(['a', 'b', 'x', 'c']))
  t.false(await val(['a', 'a']))
  t.false(await val(['a', 'b', 'c', 'b']))
  t.false(await val('lol'))
})

test('validate.arrayOfAllRoleIDs', async t => {
  const db = {
    roles: {
      find: async () => {
        return [{_id: 'a'}, {_id: 'b'}, {_id: 'c'}, {_id: '_user'}]
      },
      findOne: async ({ _id }) => {
        return ['a', 'b', 'c', '_user'].includes(_id) ? {} : null
      }
    }
  }

  const val = x => validate.arrayOfAllRoleIDs(x, {db})
  t.true(await val(['a', 'b', 'c']))
  t.true(await val(['b', 'a', 'c']))
  t.false(await val(['a']))
  t.false(await val([]))
  t.false(await val(['a', 'b', 'c', 'x']))
  t.false(await val(['a', 'b', 'b', 'c']))
  t.false(await val('lol'))
})

test('validateVar - test data is valid', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {[middleware.vars]: {x: 'hello'}}
  const { response } = await interpretMiddleware(request, middleware.validateVar('x', validate.string))
  t.false(response.wasEnded)
})

test('validateVar - test data is invalid', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {[middleware.vars]: {x: 123}}
  const { response } = await interpretMiddleware(request, middleware.validateVar('x', validate.string))
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
})

test('runIfVarExists - var does exist', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

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
  const { middleware } = quickMakeServerlessMiddleware()

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
  const { middleware } = quickMakeServerlessMiddleware()

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
  const { middleware } = quickMakeServerlessMiddleware()

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
  const { middleware } = quickMakeServerlessMiddleware()

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
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {}
  await interpretMiddleware(request,
    middleware.runIfCondition(() => true, [
      function(req, res, next) { next() }
    ])
  )
  t.deepEqual(Object.getOwnPropertySymbols(request[middleware.vars]), [])
})

// TODO: Rename this to getUserFromSessionID, everywhere.
test('getSessionUserFromID - basic functionality', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const { user, sessionID } = await makeUser(server, port)
    const request = {[middleware.vars]: {sessionID}}
    await interpretMiddleware(request,
      middleware.getSessionUserFromID('sessionID', 'user')
    )
    t.is(request[middleware.vars].user._id, user.id)
  })
})

test('getSessionUserFromID - non-string sessionID', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const request = {[middleware.vars]: {sessionID: 123}}
    const { response } = await interpretMiddleware(request,
      middleware.getSessionUserFromID('sessionID', 'user')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 400)
    t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
  })
})

test('getSessionUserFromID - sessionID for nonexistent session', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {sessionID: 'a'}}
    const { response } = await interpretMiddleware(request,
      middleware.getSessionUserFromID('sessionID', 'user')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 401)
    t.is(response.endData.error.code, 'INVALID_SESSION_ID')
    t.is(request[middleware.vars].user, undefined)
  })
})

test('getUserFromUsername - basic functionality', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const { user } = await makeUser(server, port, 'johndoe')
    const request = {[middleware.vars]: {username: 'johndoe'}}
    await interpretMiddleware(request,
      middleware.getUserFromUsername('username', 'user')
    )
    t.is(request[middleware.vars].user._id, user.id)
  })
})

test('getUserFromUsername - non-string username', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {username: 9999}}
    const { response } = await interpretMiddleware(request,
      middleware.getUserFromUsername('username', 'user')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 400)
    t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
    t.is(request[middleware.vars].user, undefined)
  })
})

test('getUserFromUsername - username of nonexistent user', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {username: 'counterfeitcharlie'}}
    const { response } = await interpretMiddleware(request,
      middleware.getUserFromUsername('username', 'user')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 404)
    t.is(response.endData.error.code, 'NOT_FOUND')
    t.is(request[middleware.vars].user, undefined)
  })
})

test('getUserFromID - basic functionality', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const { user } = await makeUser(server, port)
    const request = {[middleware.vars]: {userID: user.id}}
    await interpretMiddleware(request,
      middleware.getUserFromID('userID', 'user')
    )
    t.is(request[middleware.vars].user._id, user.id)
  })
})

test('getUserFromID - non-string userID', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {userID: 7370}}
    const { response } = await interpretMiddleware(request,
      middleware.getUserFromID('userID', 'user')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 400)
    t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
    t.is(request[middleware.vars].user, undefined)
  })
})

test('getUserFromID - id of nonexistent user', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {userID: 'a'}}
    const { response } = await interpretMiddleware(request,
      middleware.getUserFromID('userID', 'user')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 404)
    t.is(response.endData.error.code, 'NOT_FOUND')
    t.is(request[middleware.vars].user, undefined)
  })
})

test('getRoleFromID - basic functionality', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const { roleID } = await makeRole(server, port)
    const request = {[middleware.vars]: {roleID}}
    await interpretMiddleware(request,
      middleware.getRoleFromID('roleID', 'role')
    )
    t.is(request[middleware.vars].role._id, roleID)
  })
})

test('getRoleFromID - non-string id', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {roleID: 4321}}
    const { response } = await interpretMiddleware(request,
      middleware.getRoleFromID('roleID', 'role')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 400)
    t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
    t.is(request[middleware.vars].role, undefined)
  })
})

test('getRoleFromID - id of nonexistent role', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {roleID: 'bogus'}}
    const { response } = await interpretMiddleware(request,
      middleware.getRoleFromID('roleID', 'role')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 404)
    t.is(response.endData.error.code, 'NOT_FOUND')
    t.is(request[middleware.vars].role, undefined)
  })
})

test('getMessageFromID - basic functionality', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const { messageID } = await makeMessage(server, port, 'Hello, world!')
    const request = {[middleware.vars]: {messageID}}
    await interpretMiddleware(request,
      middleware.getMessageFromID('messageID', 'message')
    )
    t.is(request[middleware.vars].message._id, messageID)
    t.is(request[middleware.vars].message.text, 'Hello, world!')
  })
})

test('getMessageFromID - non-string messageID', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {messageID: 9999}}
    const { response } = await interpretMiddleware(request,
      middleware.getMessageFromID('messageID', 'message')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 400)
    t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
    t.is(request[middleware.vars].message, undefined)
  })
})

test('getMessageFromID - messageID of nonexistent message', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {messageID: 'a'}}
    const { response } = await interpretMiddleware(request,
      middleware.getMessageFromID('messageID', 'message')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 404)
    t.is(response.endData.error.code, 'NOT_FOUND')
    t.is(request[middleware.vars].message, undefined)
  })
})

test('getChannelFromID - basic functionality', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const { channelID } = await makeChannel(server, port, 'general')
    const request = {[middleware.vars]: {channelID}}
    await interpretMiddleware(request,
      middleware.getChannelFromID('channelID', 'channel')
    )
    t.is(request[middleware.vars].channel._id, channelID)
    t.is(request[middleware.vars].channel.name, 'general')
  })
})

test('getChannelFromID - non-string channelID', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {channelID: 9999}}
    const { response } = await interpretMiddleware(request,
      middleware.getChannelFromID('channelID', 'channel')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 400)
    t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
    t.is(request[middleware.vars].channel, undefined)
  })
})

test('getChannelFromID - channelID of nonexistent channel', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware }) => {
    const request = {[middleware.vars]: {channelID: 'a'}}
    const { response } = await interpretMiddleware(request,
      middleware.getChannelFromID('channelID', 'channel')
    )
    t.true(response.wasEnded)
    t.is(response.statusCode, 404)
    t.is(response.endData.error.code, 'NOT_FOUND')
    t.is(request[middleware.vars].channel, undefined)
  })
})

test('requirePermission', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    // By default, everyone has the readMessages permission, so we check for that:
    const { user: { id: userID }, sessionID } = await makeUser(server, port)
    const request = {[middleware.vars]: {sessionID}}
    const { response } = await interpretMiddleware(request, [
      ...middleware.getSessionUserFromID('sessionID', 'user'),
      ...middleware.requirePermission('user', 'readMessages')
    ])
    t.false(response.wasEnded)

    // Users don't have manageRoles by default, though:
    const request2 = {[middleware.vars]: {sessionID}}
    const { response: response2 } = await interpretMiddleware(request, [
      ...middleware.getSessionUserFromID('sessionID', 'user'),
      ...middleware.requirePermission('user', 'manageRoles')
    ])
    t.true(response2.wasEnded)
    t.is(response2.statusCode, 403)
    t.is(response2.endData.error.code, 'NOT_ALLOWED')
    t.is(response2.endData.error.missingPermission, 'manageRoles')

    // If we give the user the Owner role, then they should have every permission,
    // but we'll only test manageRoles (enough to know that requirePermission is
    // actually checking the user's roles):
    await giveOwnerRole(server, userID)
    const request3 = {[middleware.vars]: {sessionID}}
    const { response: response3 } = await interpretMiddleware(request, [
      ...middleware.getSessionUserFromID('sessionID', 'user'),
      ...middleware.requirePermission('user', 'manageRoles')
    ])
    t.false(response3.wasEnded)
  })
})

test('requireBeMessageAuthor - basic functionality, as author', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const { messageID, sessionID } = await makeMessage(server, port)
    const request = {[middleware.vars]: {messageID, sessionID}}
    const { response } = await interpretMiddleware(request, [
      ...middleware.getMessageFromID('messageID', 'message'),
      ...middleware.getSessionUserFromID('sessionID', 'user'),
      ...middleware.requireBeMessageAuthor('message', 'user')
    ])
    t.false(response.wasEnded)
  })
})

test('requireBeMessageAuthor - basic functionality, as non-author', t => {
  return testWithServer(portForMiddlewareTests++, async ({ middleware, server, port }) => {
    const { messageID } = await makeMessage(server, port)
    const { sessionID } = await makeUser(server, port)
    const request = {[middleware.vars]: {messageID, sessionID}}
    const { response } = await interpretMiddleware(request, [
      ...middleware.getMessageFromID('messageID', 'message'),
      ...middleware.getSessionUserFromID('sessionID', 'user'),
      ...middleware.requireBeMessageAuthor('message', 'user')
    ])
    t.true(response.wasEnded)
    t.is(response.statusCode, 403)
    t.is(response.endData.error.code, 'NOT_YOURS')
  })
})

test('requireNameValid - basic functionality, name valid', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {[middleware.vars]: {name: 'burrito-land'}}
  const { response } = await interpretMiddleware(request,
    middleware.requireNameValid('name')
  )
  t.false(response.wasEnded)
})

test('requireNameValid - basic functionality, name not valid', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {[middleware.vars]: {name: 'OmG???!?? Why$$## This is a DUMB name.\x1b\x1b\x1b'}}
  const { response } = await interpretMiddleware(request,
    middleware.requireNameValid('name')
  )
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INVALID_NAME')
})

test('requireNameValid - non-string name', async t => {
  const { middleware } = quickMakeServerlessMiddleware()

  const request = {[middleware.vars]: {name: {x: 123}}}
  const { response } = await interpretMiddleware(request,
    middleware.requireNameValid('name')
  )
  t.true(response.wasEnded)
  t.is(response.statusCode, 400)
  t.is(response.endData.error.code, 'INVALID_PARAMETER_TYPE')
})
