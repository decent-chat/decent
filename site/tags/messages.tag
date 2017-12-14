<messages>
  <message-group each={ messageGroups }></message-group>

  <script>
    this.messageGroups = []

    scrollBottom() {
      this.root.scrollTop = this.root.scrollHeight
    }

    const shouldAppendMsgToGroup = (msg, group) =>
      group
        && group.authorID === msg.authorID // Group by author
        && group.messages.length < 20 // Max. 20 messages

    let sessionID = null, serverURL = null, currentChannelID = null
    RiotControl.on('session_id_update', id => sessionID = id)
    RiotControl.on('switch_server', url => serverURL = url)

    RiotControl.on('switch_channel_id', async channelID => {
      currentChannelID = channelID

      this.messageGroups = []
      this.update()

      if (!channelID) {
        this.messageGroups = []
        this.update()

        return
      }

      const { messages } = await get(serverURL, `channel/${channelID}/latest-messages`)
      const newMessageGroups = messages.reduce((groups, msg) => {
        const lastGroup = groups[groups.length - 1]

        if (shouldAppendMsgToGroup(msg, lastGroup)) {
          lastGroup.messages.push(msg)
        } else {
          groups.push({
            authorID: msg.authorID,
            authorUsername: msg.authorUsername,
            channelID: msg.channelID,
            date: msg.date,
            messages: [ msg ],
          })
        }

        return groups
      }, this.messageGroups)

      this.messageGroups = newMessageGroups
      this.update()
      this.scrollBottom()
    })

    RiotControl.on('socket_message', ({ evt, data, serverURL: socketServerURL }) => {
      // Listen for new chat messages, in this channel, on this server.
      if (evt === 'received chat message' && serverURL === socketServerURL) {
        const { message } = data

        if (message.channelID !== currentChannelID) {
          return
        }

        // Do we need a new message group, or not?
        const lastGroup = this.messageGroups[this.messageGroups.length - 1]
        const needsNewGroup = !shouldAppendMsgToGroup(message, lastGroup)

        // Add the message to its rightful group.
        if (needsNewGroup) {
          this.messageGroups.push({
            authorID: message.authorID,
            authorUsername: message.authorUsername,
            channelID: message.channelID,
            date: message.date,
            messages: [ message ],
          })
        } else {
          lastGroup.messages.push(message)
        }

        // Check if we're at the bottom of the message list.
        const el = this.root
        const wasAtBottom = el.scrollTop > el.scrollHeight - el.offsetHeight - 50

        // Re-render!
        this.update()

        // If we were at the bottom of the chat we need to
        // scroll down automatically to keep up.
        if (wasAtBottom) {
          this.scrollBottom()
        }
      }
    })
  </script>

  <style>
    :scope {
      padding: 16px;
      overflow-y: auto;
    }
  </style>

</messages>
