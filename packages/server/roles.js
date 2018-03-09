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

const defaultRoles = {
  '_everyone': {
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

  '_guest': {
    name: 'Guest',
    permissions: {}
  },

  '_user': {
    name: 'User',
    permissions: {
      sendMessages: true
    }
  },

  '_owner': {
    name: 'Owner',
    permissions: {
      manageServer: true,
      manageUsers: true,
      manageRoles: true,
      manageChannels: true,
      managePins: true,
      manageEmotes: true,
      readMessages: true,
      sendMessages: true,
      sendSystemMessages: true,
      uploadImages: true,
      allowNonUnique: true
    }
  }
}

module.exports = {permissionKeys, defaultRoles}
