module.exports = function makeSerializers({util, db}) {
  const {
    emailToAvatarURL, isUserOnline, shouldUseAuthorization, getUserBySessionID,
    getUnreadMessageCountInChannel, getOldestUnreadMessageInChannel,
  } = util

  const serialize = {
    message: async m => ({
      id: m._id,
      authorUsername: m.authorUsername,
      authorID: m.authorID,
      authorFlair: m.authorFlair || '',
      authorAvatarURL: emailToAvatarURL(m.authorEmail || m.authorID),
      text: m.text,
      date: m.date,
      editDate: m.editDate,
      channelID: m.channelID,
      reactions: m.reactions
    }),

    user: async (u, sessionUser = null) => {
      const obj = {
        id: u._id,
        username: u.username,
        flair: u.flair,
        avatarURL: emailToAvatarURL(u.email || u._id),
        permissionLevel: u.permissionLevel,
        online: isUserOnline(u._id)
      }

      if (sessionUser && sessionUser._id === u._id) {
        obj.email = u.email || null

        if (await shouldUseAuthorization()) {
          obj.authorized = u.authorized || false
        }
      }

      return obj
    },

    session: async s => ({
      id: s._id,
      dateCreated: s.dateCreated
    }),

    channel: async (c, sessionUser = null) => {
      const obj = {
        id: c._id,
        name: c.name
      }

      if (sessionUser) {
        obj.unreadMessageCount = await getUnreadMessageCountInChannel(sessionUser, c._id)


        if (obj.unreadMessageCount === 0) {
          obj.oldestUnreadMessageID = null
        } else {
          const msg = await getOldestUnreadMessageInChannel(sessionUser, c._id)
          obj.oldestUnreadMessageID = msg ? await serialize.message(msg, sessionUser) : null
        }
      }

      return obj
    },

    emote: async e => ({
      shortcode: e.shortcode,
      imageURL: e.imageURL
    })
  }

  return serialize
}
