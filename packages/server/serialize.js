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
      authorAvatarURL: emailToAvatarURL(m.authorEmail || m.authorID),
      type: m.type,
      text: m.text,
      dateCreated: m.dateCreated,
      dateEdited: m.dateEdited || null,
      channelID: m.channelID,
      reactions: m.reactions,
      mentionedUserIDs: await util.getMentionsFromMessageContent(m.text),
    }),

    user: async (u, sessionUser = null) => {
      const obj = {
        id: u._id,
        username: u.username,
        flair: u.flair,
        avatarURL: emailToAvatarURL(u.email || u._id),
        roleIDs: u.roleIDs,
        online: isUserOnline(u._id),
        mentions: (await Promise.all((u.mentionedInMessageIDs || []).map(async msgID => await serialize.message(await db.messages.findOne({_id: msgID}), sessionUser)))).sort((a, b) => {
          // Sort by latest edited/created first.
          if ((a.dateEdited || a.dateCreated) > (b.dateEdited || b.dateCreated)) return -1
          if ((a.dateEdited || a.dateCreated) < (b.dateEdited || b.dateCreated)) return +1
          return 0
        }),
      }

      if (sessionUser && sessionUser._id === u._id) {
        obj.email = u.email || null
      }

      return obj
    },

    role: async s => ({
      id: s._id,
      name: s.name,
      permissions: s.permissions
    }),

    session: async s => ({
      id: s._id,
      dateCreated: s.dateCreated,
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

          obj.oldestUnreadMessageID = msg ? msg._id : null
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
