module.exports = function makeSerializers({util, db}) {
  const {
    emailToAvatarURL, isUserOnline, shouldUseAuthorization, getUserBySessionID,
    getUnreadMessageCountInChannel
  } = util

  const serialize = {
    message: async m => ({
      id: m._id,
      authorUsername: m.authorUsername,
      authorID: m.authorID,
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

    sessionBrief: async s => ({
      id: s._id,
      dateCreated: s.dateCreated
    }),

    sessionDetail: async s => {
      const user = await getUserBySessionID(s._id)

      return Object.assign(await serialize.sessionBrief(s), {
        user: await serialize.user(user, user)
      })
    },

    channelBrief: async (c, sessionUser = null) => {
      const obj = {
        id: c._id,
        name: c.name
      }

      if (sessionUser) {
        obj.unreadMessageCount = await getUnreadMessageCountInChannel(sessionUser, c._id)
      }

      return obj
    },

    // Extra details for a channel - these aren't returned in the channel list API,
    // but are when a specific channel is fetched.
    channelDetail: async (c, sessionUser = null) => {
      let pinnedMessages = await Promise.all(c.pinnedMessageIDs.map(id => db.messages.findOne({_id: id})))

      // Null messages are filtered out, just in case there's a broken message ID in the
      // pinned message list (e.g. because a message was deleted).
      pinnedMessages = pinnedMessages.filter(Boolean)

      pinnedMessages = await Promise.all(pinnedMessages.map(serialize.message))

      return Object.assign(await serialize.channelBrief(c, sessionUser), {
        pinnedMessages
      })
    }
  }

  return serialize
}
