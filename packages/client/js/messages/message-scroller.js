const { h, Component } = require('preact')
const Message = require('./message')

class MessageScroller extends Component {
  state = {
    messages: null,
    isLoading: true,
  }

  position = {
    top: null, // Message
    btm: null, // Message
  }

  static groupMessages(msgs, startingGroups = []) {
    const groups = startingGroups

    // Max milliseconds between messages before they are split up
    const apart = 30 * 60 * 1000 // 30min

    for (const msg of msgs) {
      const group = groups[groups.length - 1]

      const usePrevGroup = typeof group !== 'undefined'
        && group[0].authorID === msg.authorID
        && group[0].authorFlair === msg.authorFlair
        && group[0].authorAvatarURL === msg.authorAvatarURL
        && group.length <= 20
        && (msg.dateCreated - group[group.length - 1].dateCreated) < apart

      if (!usePrevGroup) {
        // Create a new group for this message
        groups.push([msg])
      } else {
        // Add this message to the previous group
        group.push(msg)
      }
    }

    return groups
  }

  componentDidMount() {
    this.loadMessages(this.channel)
  }

  // On channel change, load messages again.
  componentWillReceiveProps({ channel }) {
    if (channel === this.channel) return // No change!

    this.setState({
      isLoading: true,
    })

    this.loadMessages(channel)
  }

  async loadMessages(channel) {
    const messages = await channel.getMessages() // Latest messages.

    this.setState({
      isLoading: false,
      messages,
    })
  }

  render({ channel }, { messages, isLoading }) {
    this.channel = channel

    if (isLoading) {
      return <div class='MessageList Loading'></div>
    } else {
      return <div class='MessageList'>
        {MessageScroller.groupMessages(messages).map(group => <Message msg={group}/>)}
      </div>
    }
  }
}

module.exports = MessageScroller
