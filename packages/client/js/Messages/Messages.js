const { h, Component } = require('preact')
const Message = require('./Message/Message')
const InfiniteScroll = require('./InfiniteScroll/InfiniteScroll')
const MessageEditor = require('./MessageEditor/MessageEditor')

// Not deep.
const flatten = arr => [].concat(...arr)

class MessageScroller extends Component {
  static DOWN = 'DOWN'
  static UP = 'UP'
  static MAX_MESSAGE_COUNT = 50

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

  state = {
    messages: null,
    isLoading: true,
  }

  scrollPos = 10000
  loadingMore = false
  showingLatestMessage = false
  scrolledToBottom = false

  async componentDidMount() {
    await this.loadLatest(this.channel)
    this.channel.on('message', this.handleNewMessage)
  }

  // Clamp `messages.length` at `maxLength`, removing messages from the top/bottom
  // of the array based on `removeFromDirection`.
  clampMessagesLength(removeFromDirection, messages = this.state.messages, maxLength = MessageScroller.MAX_MESSAGE_COUNT) {
    if (messages.length > maxLength) {
      if (removeFromDirection === MessageScroller.DOWN) {
        // Remove messages from the end of `messages`.
        messages.length = maxLength
      } else if (removeFromDirection === MessageScroller.UP) {
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

    // Stop listening to the old channel for messages
    this.channel.removeListener('message', this.handleNewMessage)

    this.channel = channel
    this.componentDidMount()
  }

  handleNewMessage = newMessage => {
    if (!this.showingLatestMessage) return

    const alreadyExisting = flatten(this.state.messages).find(msg => msg.id === newMessage)

    if (alreadyExisting) {
      // If we already added this message in anticipation (ie. WE sent it) of
      // the event, mark it as actually recieved.
      //
      // Note: sent-message anticipation isn't actually implemented yet
      if (alreadyExisting.anticipated) {
        alreadyExisting.anticipated = false
        this.forceUpdate()
      } else {
        // ???
        //
        // ...I love network-dependent edge-cases!
      }
    } else {
      if (this.scrolledToBottom) this.scrollPos = 10000

      this.setState({
        messages: MessageScroller.groupMessages(
          (do {
            const flat = flatten(this.state.messages)

            if (flat.length > MessageScroller.MAX_MESSAGE_COUNT) {
              flat.splice(0, flat.length - MessageScroller.MAX_MESSAGE_COUNT)
            }

            flat
          }).concat([newMessage])
        )
      })
    }
  }

  async loadLatest(channel) {
    this.setState({
      isLoading: true,
    })

    const messages = await channel.getMessages()

    this.scrollPos = 10000
    this.scrolledToBottom = true
    this.showingLatestMessage = true

    this.setState({
      isLoading: false,
      messages: MessageScroller.groupMessages(messages),
    })
  }

  handleOnScroll(pos, prevPos, max) {
    const diff = pos - prevPos

    if (diff < -10 && prevPos !== 10000) {
      // We went upwards!
      this.scrolledToBottom = false
    }

    this.scrollPos = pos
    this.scrollMax = max
  }

  async handleReachTop() {
    if (this.loadingMore) return
    this.loadingMore = true

    // Load messages ABOVE us.
    const firstMessage = flatten(this.state.messages)[0]
    const moreMessages = await this.channel.getMessages({before: firstMessage, limit: 25})

    if (moreMessages.length > 0) {
      this.keepScrollAtAnchor(firstMessage)

      this.setState({
        messages: MessageScroller.groupMessages(
          moreMessages.concat(do {
            const flat = flatten(this.state.messages)

            if (flat.length > MessageScroller.MAX_MESSAGE_COUNT) flat.length = MessageScroller.MAX_MESSAGE_COUNT
            else this.showingLatestMessage = false

            flat
          })
        ),
      })
    }

    this.loadingMore = false
  }

  componentDidUpdate() {
    if (this.runAfterRender) {
      this.runAfterRender()
      delete this.runAfterRender
    }
  }

  async handleReachBottom() {
    if (this.loadingMore) return
    this.loadingMore = true

    // Load messages BELOW us.
    const finalMessage = do {
      const messages = flatten(this.state.messages)
      messages[messages.length - 1]
    }

    const moreMessages = await this.channel.getMessages({after: finalMessage, limit: 25})

    if (moreMessages.length < 25) {
      this.showingLatestMessage = true
    }

    if (moreMessages.length > 0) {
      this.keepScrollAtAnchor(finalMessage)

      this.setState({
        messages: MessageScroller.groupMessages(moreMessages, this.clampMessagesLength(MessageScroller.UP, this.state.messages, MessageScroller.MAX_MESSAGE_COUNT - moreMessages.length)),
      })
    } else {
      this.scrolledToBottom = true
    }

    this.loadingMore = false
  }

  keepScrollAtAnchor(anchorElem) {
    // Next time messages are added or removed, scroll so that
    // the anchor element is in the same place on the screen
    // as it was before the change
    const msgOffset = (messageID) => {
      const messageTop = document.getElementById(messageID).getBoundingClientRect().top
      const containerTop = this.ScrollContainer.base.getBoundingClientRect().top
      return messageTop - containerTop
    }

    const messageID = 'msg-' + anchorElem.id
    const originalOffset = msgOffset(messageID)

    this.runAfterRender = () => {
      const currentOffset = msgOffset(messageID)
      const scrollDelta = currentOffset - originalOffset
      this.ScrollContainer.base.scrollTop += scrollDelta
    }
  }

  sendMessage = content => {
    this.props.channel.sendMessage(content)
  }

  render({ channel }, { messages, isLoading }) {
    this.channel = channel

    if (isLoading) {
      return <div class='MessageList Loading'></div>
    } else {
      if(!channel) return <main></main>

      return <main>
        <div class='ChannelHeader'>{channel.toString()}</div>
        <InfiniteScroll
          onReachBottom={() => this.handleReachBottom()}
          onReachTop={() => this.handleReachTop()}
          onScroll={(...args) => this.handleOnScroll(...args)}
          position={this.scrollPos}
          ref={elem => { this.ScrollContainer = elem }}
        >
          <div class='MessageList'>
            {messages.map(group => <Message msg={group}/>)}
          </div>
        </InfiniteScroll>
        <MessageEditor sendMessage={ this.sendMessage.bind(this) }/>
      </main>
    }
  }
}

module.exports = MessageScroller
