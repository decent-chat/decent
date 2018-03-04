const { h, Component } = require('preact')
const Message = require('./message')

// Not deep.
const flatten = arr => [].concat(...arr)

class MessageScroller extends Component {
  state = {
    messages: null,
    isLoading: true,
  }

  position = {
    latest: false,
    top: null, // Message
    btm: null, // Message
  }

  loadingMore = false

  static DOWN = Symbol('down')
  static UP = Symbol('up')

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

  async componentDidMount() {
    await this.loadLatest(this.channel)

    this.channel.on('message', newMessage => {
      if (!this.position.latest) return

      const alreadyExisting = flatten(this.state.messages).find(msg => msg.id === newMessage)

      if (alreadyExisting) {
        // If we already added this message in anticipation (ie. WE sent it) of
        // the event, mark it as actually recieved.
        if (alreadyExisting.anticipated) {
          alreadyExisting.anticipated = false
          this.clampMessagesLength(MessageScroller.UP)
          this.forceUpdate()
        } else {
          // ???
          //
          // ...I love network-dependent edge-cases!
        }
      } else {
        this.setState({
          messages: this.clampMessagesLength(MessageScroller.UP, MessageScroller.groupMessages([newMessage], this.state.messages)),
        })
      }
    })
  }

  // Clamp `messages.length` at `maxLength`, removing messages from the top/bottom
  // of the array based on `removeFromDirection`.
  clampMessagesLength(removeFromDirection, messages = this.state.messages, maxLength = 80) {
    if (messages.length > maxLength) {
      if (removeFromDirection === MessagesScroller.DOWN) {
        // Remove messages from the end of `messages`.
        messages.length = maxLength
      } else if (removeFromDirection === MessagesScroller.UP) {
        // Remove messages from the start of `messages`.
        messages.splice(0, messages.length - maxLength)
      } else {
        throw new TypeError('clampMessagesLength(removeFromDirection): expected MessagesScroller.DOWN or UP')
      }
    }

    return messages
  }

  // On channel change, load messages again.
  componentWillReceiveProps({ channel }) {
    if (channel === this.channel) return // No change!

    this.channel = channel
    this.componentDidMount()
  }

  async loadLatest(channel) {
    this.setState({
      isLoading: true,
    })

    const messages = await channel.getMessages()

    this.position = {
      latest: true,
      top: messages[0],
      btm: messages[messages.length - 1],
    }

    this.setState({
      isLoading: false,
      messages: MessageScroller.groupMessages(messages),
    })
  }

  render({ channel }, { messages, isLoading }) {
    this.channel = channel

    if (isLoading) {
      return <div class='MessageList Loading'></div>
    } else {
      return <div class='MessageList'>
        {messages.map(group => <Message msg={group}/>)}
      </div>
    }
  }
}

module.exports = MessageScroller
