const serverSettingsID = 'server-settings'
const serverPropertiesID = 'server-properties'
const errors = require('./errors')

const defaultSettings = {
  // "Server settings" - these are settings that Do Things on the server. They can
  // be safely updated while the program is running, and basically work right away.
  // Admins can change server settings by POSTing to /api/server-settings, and
  // anyone can view them by GETting the same endpoint.
  [serverSettingsID]: {
    // The name of the server.
    name: {value: 'Unnamed Decent chat server'},

    // Authorization message displayed to users who are logged in but not
    // authorized to participate in the server. Must be less than 800
    // characters long, and supports Markdown.
    authorizationMessage: {
      value: 'Unauthorized - contact this server\'s webmaster to authorize your account for interacting with the server.',
      validationFn: string => {
        if (typeof string !== 'string') {
          throw 'not a string'
        }

        if (string.length > 800) {
          throw 'greater than 800 characters long'
        }
      }
    }
  },

  // Server properties - these settings don't do anything until the server is
  // restarted. These aren't publicly visible, and can only be edited through the
  // command line prompt.
  [serverPropertiesID]: {
    // HTTPS enforcement - whether or not to secure anything and everything sent
    // between the server and client (including web sockets). This is not actually
    // implemented yet.
    https: {value: 'off', possibleValues: ['on', 'off']},

    // Authorization required - whether or not users will need to be authorized
    // before they can interact with the server (or view its messages). Anyone
    // can still register, but an admin must mark the user as authorized before
    // they will be able to send or receive any information to/from the server.
    requireAuthorization: {value: 'off', possibleValues: ['on', 'off']}
  }
}

module.exports.setupDefaultSettings = async function(settingsDB) {
  // Setup default server settings - add new fields if they're missing,
  // don't overwrite any fields already there.

  for (const [settingsCategoryID, configSpec] of Object.entries(defaultSettings)) {
    const originalSettingsDoc = await settingsDB.findOne({_id: settingsCategoryID})

    const query = {$set: {}}

    for (const [ key, { value } ] of Object.entries(configSpec)) {
      if (originalSettingsDoc && key in originalSettingsDoc === true) {
        continue
      }

      query.$set[key] = value
    }

    await settingsDB.update({_id: settingsCategoryID}, query, {upsert: true})
  }
}

module.exports.setSetting = async function(settingsDB, categoryID, key, value) {
  const settingSpec = defaultSettings[categoryID][key]

  if (!settingSpec) {
    return 'invalid key'
  }

  if (settingSpec.possibleValues) {
    if (settingSpec.possibleValues.includes(value) === false) {
      return `invalid value - must be one of ${JSON.stringify(settingSpec.possibleValues)}`
    }
  }

  if (settingSpec.validationFn) {
    try {
      // validationFn should reject to declare the value invalid, with
      // a string error message to display to the user.
      await settingSpec.validationFn(value)
    } catch (error) {
      return `invalid value - ${error}`
    }
  }

  await settingsDB.update({_id: categoryID}, {
    $set: {
      [key]: value
    }
  })

  return 'updated'
}

Object.assign(module.exports, {
  serverSettingsID,
  serverPropertiesID,
})
