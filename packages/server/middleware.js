const errors = require('./errors')
const { internalRoles, permissionKeys } = require('./roles')

module.exports.makeMiddleware = function({db, util}) {
  const {
    getUserIDBySessionID, getUserBySessionID,
    isUserOnline, isUserAuthorized,
    emailToAvatarURL, isNameValid,
    getUserPermissions, userHasPermission,
    getUnreadMessageCountInChannel
  } = util

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
        _loadVarFromObject(request, response, next, request.body || {}, key, required)
      }
    ],

    loadVarFromQuery: (key, required = true) => [
      // Exactly the same as loadVarFromBody, except grabbing things from the url
      // query (?a=b&c=d...) instead of the request body.

      ...middleware.verifyVarsExists(),

      function(request, response, next) {
        _loadVarFromObject(request, response, next, request.query || {}, key, required)
      }
    ],

    loadVarFromQueryOrBody: (key, required = true) => [
      // Combines loadVarFromQuery and loadVarFromBody. The body recieves priority.

      ...middleware.loadVarFromQuery(key, false),
      ...middleware.loadVarFromBody(key, false),

      async function (request, response, next) {
        if (required && request[middleware.vars][key] === undefined) {
          response.status(400).end(JSON.stringify({
            error: Object.assign({}, errors.INCOMPLETE_PARAMETERS, {
              missing: key
            })
          }))
        } else {
          next()
        }
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

        if (await validationFn(value, {db})) {
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

    loadSessionID: (sessionIDVar, shouldError = true) => [
      ...middleware.verifyVarsExists(),

      function(request, response, next) {
        // First we check the body for the session ID. If we don't find anything,
        // we check the query URL, then the headers (for X-Session-ID). If we
        // still don't find a session ID and one is required - shouldError - we'll
        // stop the request immediately.
        let sessionID
        if ('sessionID' in request.body) {
          sessionID = request.body.sessionID
        } else if ('sessionID' in request.query) {
          sessionID = request.query.sessionID
        } else if ('x-session-id' in request.headers) {
          sessionID = request.headers['x-session-id'] // All headers are lowercase.
        } else if (shouldError) {
          // No session ID given - just quit here.
          response.status(401).json({error: Object.assign(
            {}, errors.INCOMPLETE_PARAMETERS, {missing: 'sessionID'}
          )})
          return
        }

        if (sessionID) {
          request[middleware.vars][sessionIDVar] = sessionID
        }

        next()
      },

      ...middleware.runIfVarExists(sessionIDVar, [
        ...middleware.validateVar(sessionIDVar, validate.string)
      ])
    ],

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

    requirePermission: (userVar, permissionKey) => [
      async function(request, response, next) {
        const { _id: userID } = request[middleware.vars][userVar]

        if (await userHasPermission(userID, permissionKey)) {
          next()
        } else {
          response.status(403).end(JSON.stringify({
            error: Object.assign({}, errors.NOT_ALLOWED, {
              missingPermission: permissionKey
            })
          }))
        }
      }
    ],

    requireChannelPermission: (userVar, channelVar, permissionVar) => [
      async function(request, response, next) {
        const { _id: userID } = request[middleware.vars][userVar]
        const { _id: channelID } = request[middleware.vars][channelVar]
        const permissionKey = request[middleware.vars][permissionVar]

        if (await userHasPermission(userID, permissionKey, channelID)) {
          next()
        } else {
          response.status(403).end(JSON.stringify({
            error: Object.assign({}, errors.NOT_ALLOWED, {
              missingPermission: permissionKey,
              requirePermissionInChannel: true
            })
          }))
        }
      }
    ],

    requireBeAdmin: userVar => [
      async function(request, response, next) {
        response.status(500).json({
          error: Object.assign({}, errors.INTERNAL_ERROR, {
            message: 'Attempted to use obsolete requireBeAdmin middleware'
          })
        })
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

  return middleware
}

const validate = {
  string: Object.assign(function(x) {
    return typeof x === 'string'
  }, {description: 'a string'}),

  object: Object.assign(function(x) {
    return typeof x === 'object' && !Array.isArray(x)
  }, {description: 'an object'}),

  roleName: Object.assign(function(x) {
    return typeof x === 'string' && x.length > 0 && x.length <= 32
  }, {description: 'a valid role name (<= 32 chars)'}),

  permissionsObject: Object.assign(function(x) {
    return typeof x === 'object' &&
      Object.keys(x).every(k => permissionKeys.includes(k)) &&
      Object.values(x).every(v => [true, false, undefined, null].includes(v))
  }, {description: 'a permissions object'}),

  arrayOfRoleIDs: Object.assign(async function(x, {db}) {
    if (!Array.isArray(x)) return false
    if (x.some(r => typeof r !== 'string')) return false

    // Return false if there are any duplicate items.
    if (x.some((r, i) => x.slice(i + 1).includes(r))) return false

    if (x.some(r => internalRoles.isInternalID(r))) return false

    const roles = await Promise.all(x.map(id => db.roles.findOne({_id: id})))
    if (roles.some(r => r === null)) return false

    return true
  }, {description: 'an array of non-internal, existant role IDs'}),

  arrayOfAllRoleIDs: Object.assign(async function(x, {db}) {
    if (!await validate.arrayOfRoleIDs(x, {db})) return false

    let allRoles = await db.roles.find({})
    allRoles = allRoles.filter(r => !internalRoles.isInternalID(r._id))
    if (allRoles.some(r => !x.includes(r._id))) return false

    return true
  }, {description: 'an array of every non-internal, existant role ID'}),

  defined: Object.assign(function(x) {
    return typeof x !== 'undefined'
  }, {description: 'defined'})
}

module.exports.validate = validate
