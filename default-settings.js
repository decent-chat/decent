const serverSettingsID = 'server-settings'
const serverPropertiesID = 'server-properties'

module.exports = async function(settingsDB) {
  // Setup default server settings - add new fields if they're missing.
  // We use a function so that settings are extensible; more setting
  // categories can be added in the future.
  const setupDefaultSettings = async function(settingsCategoryID, properties) {
    let query

    const originalSettingsDoc = settingsDB.findOne({_id: settingsCategoryID})

    if (originalSettingsDoc) {
      // If the settings doc already exists, we want to avoid overwriting any fields.
      query = {$set: {}}
      for (const [ key, value ] of Object.entries(properties)) {
        if (key in originalSettingsDoc === false) {
          query.$set[key] = value
        }
      }
    } else {
      // If there's no settings doc, we'll just insert everything passed through
      // the properties object.
      query = properties
    }

    await settingsDB.update({_id: settingsCategoryID}, query, {upsert: true})
  }

  // "Server settings" - these are settings that Do Things on the server. They can
  // be safely updated while the program is running, and basically work right away.
  // Admins can change server settings by POSTing to /api/server-settings, and
  // anyone can view them by GETting the same endpoint.
  await setupDefaultSettings(serverSettingsID, {
    // The name of the server.
    name: 'Unnamed bantisocial server'
  })

  // Server properties - these settings don't do anything until the server is
  // restarted. These aren't publicly visible, and can only be edited through the
  // command line prompt.
  await setupDefaultSettings(serverPropertiesID, {
    // HTTPS enforcement - whether or not to secure anything and everything sent
    // between the server and client (including web sockets). This is not actually
    // implemented yet.
    https: 'off'
  })
}

Object.assign(module.exports, {
  serverSettingsID,
  serverPropertiesID,
})
