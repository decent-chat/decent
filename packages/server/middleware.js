const errors = require('./errors')

module.exports.makeMiddleware = function({db}) {
  // The olde General Valid Name regex. In the off-chance it's decided that
  // emojis should be allowed (or whatever) in channel/user/etc names, this
  // regex can be updated.
  const isNameValid = name => /^[a-zA-Z0-9_-]+$/g.test(name)

  const _loadVarFromObject = (request, response, next, obj, key, required) => {
    if (required && obj[key] === undefined) {
      response.status(400).end(JSON.stringify({
        error: Object.assign({}, errors.INCOMPLETE_PARAMETERS, {
          missing: key
        })
      }))

      return
    }

    if (obj[key] !== undefined) {
      request[middleware.vars][key] = obj[key]
    }

    next()
  }

  const getUserIDBySessionID = async function(sessionID) {
    if (!sessionID) {
      return null
    }

    const session = await db.sessions.findOne({_id: sessionID})

    if (!session) {
      return null
    }

    return session.userID
  }

  const getUserBySessionID = async function(sessionID) {
    const userID = await getUserIDBySessionID(sessionID)

    if (!userID) {
      return null
    }

    const user = await db.users.findOne({_id: userID})

    if (!user) {
      return null
    }

    return user
  }

  const middleware = {
    vars: Symbol('Middleware variables'),

    verifyVarsExists: () => [
      // Makes sure the vars dictionary is actually a thing stored on the request.
      // If it isn't, this creates it.

      function(request, response, next) {
        if (middleware.vars in request === false) {
          request[middleware.vars] = {}
        }

        next()
      }
    ],

    loadVarFromBody: (key, required = true) => [
      // Takes a value from the given body object and stores it as a variable.
      // If the 'required' argument is set to true and the key is not found in
      // the request's body, an error message is shown in response.

      ...middleware.verifyVarsExists(),

      function(request, response, next) {
        _loadVarFromObject(request, response, next, request.body, key, required)
      }
    ],

    loadVarFromQuery: (key, required = true) => [
      // Exactly the same as loadVarFromBody, except grabbing things from the url
      // query (?a=b&c=d...) instead of the request body.

      ...middleware.verifyVarsExists(),

      function(request, response, next) {
        _loadVarFromObject(request, response, next, request.query, key, required)
      }
    ],

    loadVarFromParams: key => [
      // Same as loadVarFromBody, but it loads from the request's params.
      // Use this for GET requests where the parameter is labeled in the URL,
      // e.g .get('/api/message/:messageID').

      ...middleware.verifyVarsExists(),

      function(request, response, next) {
        if (request.params[key] !== undefined) {
          request[middleware.vars][key] = request.params[key]
        }

        next()
      }
    ],

    validateVar: (varName, validationFn) => [
      ...middleware.verifyVarsExists(),

      async function(request, response, next) {
        const value = request[middleware.vars][varName]

        if (await validationFn(value)) {
          next()
        } else {
          response.status(400).end(JSON.stringify({
            error: Object.assign({}, errors.INVALID_PARAMETER_TYPE, {
              message: `Expected ${varName} to be ${validationFn.description}.`
            })
          }))
        }
      }
    ],

    runIfVarExists: (varName, runIfSo) => (
      runIfSo.map(callback => (request, response, next) => {
        if (varName in request[middleware.vars]) {
          callback(request, response, next)
        } else {
          next()
        }
      })
    ),

    runIfCondition: (conditionFn, runIfSo, runIfNot = []) => {
      const conditionResultSymbol = Symbol('runIfCondition condition result')

      return [
        ...middleware.verifyVarsExists(),

        async function(request, response, next) {
          request[middleware.vars][conditionResultSymbol] = await conditionFn()
          next()
        },

        ...runIfSo.map(callback => (request, response, next) => {
          if (request[middleware.vars][conditionResultSymbol]) {
            callback(request, response, next)
          } else {
            next()
          }
        }),

        ...runIfNot.map(callback => (request, response, next) => {
          if (!request[middleware.vars][conditionResultSymbol]) {
            callback(request, response, next)
          } else {
            next()
          }
        }),

        function(request, response, next) {
          delete request[middleware.vars][conditionResultSymbol]
          next()
        }
      ]
    },

    getSessionUserFromID: (sessionIDVar, sessionUserVar) => [
      ...middleware.validateVar(sessionIDVar, validate.string),

      async function(request, response, next) {
        const sessionID = request[middleware.vars][sessionIDVar]
        const user = await getUserBySessionID(sessionID)

        if (!user) {
          response.status(401).end(JSON.stringify({
            error: errors.INVALID_SESSION_ID
          }))

          return
        }

        request[middleware.vars][sessionUserVar] = user

        next()
      }
    ],

    getUserFromUsername: (usernameVar, userVar) => [
      ...middleware.validateVar(usernameVar, validate.string),

      async function(request, response, next) {
        const username = request[middleware.vars][usernameVar]
        const user = await db.users.findOne({username})

        if (!user) {
          response.status(404).end(JSON.stringify({
            error: errors.NOT_FOUND
          }))

          return
        }

        request[middleware.vars][userVar] = user

        next()
      }
    ],

    getUserFromID: (userIDVar, userVar) => [
      ...middleware.validateVar(userIDVar, validate.string),

      async function(request, response, next) {
        const userID = request[middleware.vars][userIDVar]
        const user = await db.users.findOne({_id: userID})

        if (!user) {
          response.status(404).end(JSON.stringify({
            error: errors.NOT_FOUND
          }))

          return
        }

        request[middleware.vars][userVar] = user

        next()
      }
    ],

    getMessageFromID: (messageIDVar, messageVar) => [
      ...middleware.validateVar(messageIDVar, validate.string),

      async function(request, response, next) {
        const messageID = request[middleware.vars][messageIDVar]
        const message = await db.messages.findOne({_id: messageID})

        if (!message) {
          response.status(404).end(JSON.stringify({
            error: errors.NOT_FOUND
          }))

          return
        }

        request[middleware.vars][messageVar] = message

        next()
      }
    ],

    getChannelFromID: (channelIDVar, channelVar) => [
      ...middleware.validateVar(channelIDVar, validate.string),

      async function(request, response, next) {
        const channelID = request[middleware.vars][channelIDVar]
        const channel = await db.channels.findOne({_id: channelID})

        if (!channel) {
          response.status(404).end(JSON.stringify({
            error: errors.NOT_FOUND
          }))

          return
        }

        request[middleware.vars][channelVar] = channel

        next()
      }
    ],

    requireBeAdmin: userVar => [
      async function(request, response, next) {
        const { permissionLevel } = request[middleware.vars][userVar]

        if (permissionLevel !== 'admin') {
          response.status(403).end(JSON.stringify({
            error: errors.MUST_BE_ADMIN
          }))

          return
        }

        next()
      }
    ],

    requireBeMessageAuthor: (messageVar, userVar) => [
      async function(request, response, next) {
        const message = request[middleware.vars][messageVar]
        const user = request[middleware.vars][userVar]

        if (message.authorID !== user._id) {
          response.status(403).end(JSON.stringify({
            error: errors.NOT_YOURS
          }))

          return
        }

        next()
      }
    ],

    requireNameValid: (nameVar) => [
      ...middleware.validateVar(nameVar, validate.string),

      function(request, response, next) {
        const name = request[middleware.vars][nameVar]

        if (isNameValid(name) === false) {
          response.status(400).end(JSON.stringify({
            error: errors.INVALID_NAME
          }))

          return
        }

        next()
      }
    ],
  }

  return {
    middleware,
    util: {getUserIDBySessionID, getUserBySessionID}
  }
}

const validate = {
  string: Object.assign(function(x) {
    return typeof x === 'string'
  }, {description: 'a string'})
}

module.exports.validate = validate
