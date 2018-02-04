const { test } = require('ava')
const { makeMiddleware, validate } = require('../middleware')
const Datastore = require('nedb')

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
      response.endData = data
      return response
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
    function(request, response, next) {
      setTimeout(() => {
        request.n = 2
        next()
      }, 150)
    },
    function(request, response, next) {
      request.n *= 4
      next()
    },
    resolve
  ]))
  t.is(request.n, 8)
})

test('interpretMiddleware - basic usage', async t => {
  const request = {}
  await interpretMiddleware(request, [
    function(request, response, next) {
      setTimeout(() => {
        request.n = 2
        next()
      }, 150)
    },
    function(request, response, next) {
      request.n *= 4
      next()
    }
  ])
  t.is(request.n, 8)
})

test('interpretMiddleware - response.end', async t => {
  const request = {}
  const { response } = await interpretMiddleware(request, [
    function(request, response, next) {
      response.end(123)
    }
  ])
  t.true(response.wasEnded)
  t.is(response.endData, 123)
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
})
