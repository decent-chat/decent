// groups messages where:
//  * the messages have the same author
//  * the group has <= 20 messages
//  * the messages are < 30 min apart (TODO configurable by client)
const groupMessages = messages => {
  const groups = []

  for (const message of messages) {
    const group = groups[groups.length - 1]

    const okInGroup = typeof group !== 'undefined' && messageOkInGroup(message, group)

    if (!okInGroup) {
      // create a new group for this message
      groups.push(createGroupFromMessage(message))
    } else {
      // add this message to the last group
      group.messages.push(message)
    }
  }

  return groups
}

const messageOkInGroup = (message, group) => {
  // milliseconds between messages (= 30min)
  const timeBetween = 30 * 60 * 1000 // TODO make this per-user/client via storage

  return group.authorID === message.authorID &&
    group.messages.length <= 20 &&
    (message.date - group.messages[group.messages.length - 1].date) < timeBetween
}

const createGroupFromMessage = message => {
  return {
    authorID: message.authorID,
    authorUsername: message.authorUsername,
    authorAvatarURL: message.authorAvatarURL,
    messages: [ message ]
  }
}

module.exports = {
  groupMessages,
  messageOkInGroup,
  createGroupFromMessage
}
