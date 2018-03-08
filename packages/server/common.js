// Unrelated to CommonJS.

const memoize = require('memoizee')
const crypto = require('crypto')
const mrk = require('mrk.js/async')
const { serverPropertiesID } = require('./settings')

module.exports = function makeCommonUtils({db, connectedSocketsMap}) {
  // The olde General Valid Name regex. In the off-chance it's decided that
  // emojis should be allowed (or whatever) in channel/user/etc names, this
  // regex can be updated.
  const isNameValid = name => /^[a-zA-Z0-9_-]+$/g.test(name)

  const asUnixDate = jsDate => Math.floor(jsDate / 1000)
  const unixDateNow = () => asUnixDate(Date.now())

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

  const md5 = string => {
    if (typeof string !== 'string' || string.length === 0) {
      throw new Error('md5() was not passed string')
    }

    return crypto.createHash('md5').update(string).digest('hex')
  }

  const emailToAvatarURL = memoize(email =>
    `https://seccdn.libravatar.org/avatar/${email ? md5(email) : ''}?d=retro`
  )

  const isUserOnline = function(userID) {
    // Simple logic: a user is online iff there is at least one socket whose
    // session belongs to that user.

    return Array.from(connectedSocketsMap.values())
      .some(socketData => socketData.userID === userID)
  }

  const shouldUseAuthorization = async function() {
    const { requireAuthorization } = await db.settings.findOne({_id: serverPropertiesID})

    return requireAuthorization === 'on'
  }

  const isUserAuthorized = async function(userID) {
    // Checks if a user is authorized. If authorization is disabled, this will
    // always return true (even if the "authorized" field is set to false).

    if (await shouldUseAuthorization() === false) {
      return true
    }

    const user = await db.users.findOne({_id: userID})

    return user && user.authorized ? true : false
  }

  const getUnreadMessageCountInChannel = async function(userObj, channelID) {
    let date = 0
    const { lastReadChannelDates } = userObj
    if (lastReadChannelDates) {
      if (channelID in lastReadChannelDates) {
        date = lastReadChannelDates[channelID]
      }
    }

    const cursor = db.messages.ccount({
      date: {$gt: date},
      channelID
    }).limit(200)
    const count = await cursor.exec()

    return count
  }

  const getOldestUnreadMessageInChannel = async function(userObj, channelID) {
    let date = 0
    const { lastReadChannelDates } = userObj
    if (lastReadChannelDates) {
      if (channelID in lastReadChannelDates) {
        date = lastReadChannelDates[channelID]
      }
    }

    const message = await db.messages.findOne({
      date: {$gt: date},
      channelID
    })

    return message
  }

  const getMentionsFromMessageContent = async function(text) {
    const { tokens } = await mrk({
      extendPatterns: {
        // We parse code and codeblocks here as well as mentions so we don't see
        // things like `console.log('@florrie')` as having a mention in it.

        code({ read, has }) {
          if(read() === '`') {
            if (read() === '`') return false

            // Eat up every character until another backtick
            let escaped = false, char, n

            while (char = read()) {
              if (char === '\\' && !escaped) escaped = true
              else if (char === '`' && !escaped) return true
              else escaped = false
            }
          }
        },

        codeblock({ read, readUntil, look }, meta) {
          if (read(3) !== '```') return

          let numBackticks = 3
          while (look() === '`') {
            numBackticks++
            read()
          }

          // All characters up to newline following the intial
          // set of backticks represent the language of the code
          let lang = readUntil('\n')
          read()

          // Final fence
          let code = ''
          while (look(numBackticks) !== '`'.repeat(numBackticks)) {
            if (look().length === 0) return false // We've reached the end
            code += read()
          }

          read(numBackticks)
          if (look() !== '\n' && look() !== '') return false

          // Set metadata
          meta({ lang, code })

          return true
        },

        async mention({ read, readUntil }, meta) {
          if (read(2) !== '<@') return false

          const userID = readUntil('>')
          const user = await db.users.findOne({_id: userID})

          if (!user) return false

          meta({userID: userID})

          return read(1) === '>'
        },
      },
    })(text)

    return tokens
      .filter(tok => tok.name === 'mention')
      .map(tok => tok.metadata.userID)
  }

  return {
    isNameValid,
    asUnixDate, unixDateNow,
    getUserIDBySessionID, getUserBySessionID,
    md5,
    isUserOnline, isUserAuthorized,
    emailToAvatarURL,
    getUnreadMessageCountInChannel, getOldestUnreadMessageInChannel,
    shouldUseAuthorization,
    getMentionsFromMessageContent,
  }
}
