<messages>
  <message-group each={ messageGroups }></message-group>

  <script>
    this.messageGroups = []

    scrollBottom() {
      this.root.scrollTop = this.root.scrollHeight
    }

    let sessionID = null, serverURL = null
    RiotControl.on('session_id_update', id => sessionID = id)
    RiotControl.on('switch_server', url => serverURL = url)

    RiotControl.on('switch_channel_id', async channelID => {
      this.messageGroups = []
      this.update()

      if (!channelID) {
        return
      }

      const { messages } = await get(serverURL, `channel/${channelID}/latest-messages`)
      const newMessageGroups = messages.reduce((groups, msg) => {
        const lastGroup = groups[groups.length - 1]
        const shouldAppend = lastGroup
          && lastGroup.authorID === msg.authorID // Group by author
          && lastGroup.date <= Date.now() - HOUR // First message in group < 1 hour ago
        
        if (shouldAppend) {
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
  </script>

  <style>
    :scope {
      padding: 16px;
      overflow-y: auto;
    }
  </style>

</messages>
