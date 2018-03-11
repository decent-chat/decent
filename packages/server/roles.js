const permissionKeys = [
  'allowNonUnique',
  'manageChannels',
  'manageEmotes',
  'managePins',
  'manageRoles',
  'manageServer',
  'manageUsers',
  'readMessages',
  'sendMessages',
  'sendSystemMessages',
  'uploadImages',
]

// These are the only permissions that have an effect on guest users
// (i.e. anybody who is not logged in). Other permissions strictly
// cannot be set on the _everyone and _guest roles. (If you want to
// change one of the other permissions on all registered users, change
// the _user role.)
const guestPermissionKeys = [
  'readMessages',
]

// Internal roles - generally invisible, behave like magic.
const internalRoles = [
  {
    _id: '_everyone',
    name: 'Everyone',
    permissions: {
      manageServer: false,
      manageUsers: false,
      manageRoles: false,
      manageChannels: false,
      managePins: false,
      manageEmotes: false,
      readMessages: true,
      sendMessages: false,
      sendSystemMessages: false,
      uploadImages: false,
      allowNonUnique: false
    }
  },

  {
    _id: '_guest',
    name: 'Guest',
    permissions: {}
  },

  {
    _id: '_user',
    name: 'User',
    permissions: {
      sendMessages: true
    }
  }
]

internalRoles.ids = internalRoles.map(r => r._id)
internalRoles.isInternalID = id => internalRoles.ids.includes(id)

module.exports = {permissionKeys, guestPermissionKeys, internalRoles}
