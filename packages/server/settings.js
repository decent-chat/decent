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
    name: {
      value: 'Unnamed Decent chat server'
    },

    // The URL to the server icon.
    iconURL: {
      value: ''
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

    // Role prioritization order - the order that permissions of roles are
    // applied when calculating a user's permissions. This is stored on the
    // server properties because we really, really don't want anybody to mess
    // with it, and we can't entirely validate it from here (see below).
    // We could give it an "internal" property or whatever, but this is sort
    // of feature creep; it's much simpler just to throw it onto the properties
    // section.
    rolePrioritizationOrder: {value: []}
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
    throw new Error(`invalid key "${key}"`)
  }

  if (settingSpec.possibleValues) {
    if (settingSpec.possibleValues.includes(value) === false) {
      throw new Error(`invalid value - must be one of ${JSON.stringify(settingSpec.possibleValues)}`)
    }
  }

  await settingsDB.update({_id: categoryID}, {
    $set: {
      [key]: value
    }
  })
}

module.exports.getAllSettings = async function(settingsDB, categoryID) {
  return await settingsDB.findOne({_id: categoryID}, {_id: false})
}

Object.assign(module.exports, {
  serverSettingsID,
  serverPropertiesID,
})
