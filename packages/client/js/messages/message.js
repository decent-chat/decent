const { h, Component } = require('preact')
const Icon = require('../icon')
const TimeAgo = require('../timeago')

// Note that this component supports both message groups (Array<Message>) *and*
// lone messages (Message).
class Message extends Component {
  // TODO: markdown, actions

  componentDidMount() {
    const messages = Array.isArray(this.props.msg) ? this.props.msg : [this.props.msg]

    for (const message of messages) {
      message.on('change', () => this.forceUpdate())
    }
  }

  render({ msg, showActions = true }) {
    const messages = (Array.isArray(msg) ? msg : [msg]).filter(msg => !msg.deleted)

    if (messages.length === 0) return null

    const {
      authorAvatarURL,
      authorFlair,
      authorUsername,
      dateCreated,
      anticipated: anticipatedGroup,
    } = messages[0]

    if (anticipatedGroup) showActions = false

    return <div class={anticipatedGroup ? 'MessageGroup --anticipated' : 'MessageGroup'}>
      <img class='MessageGroup-authorAvatar Avatar' src={authorAvatarURL}/>
      <div class='MessageGroup-contents'>
        <div class='MessageGroup-info'>
          <div class='MessageGroup-authorUsername'>{authorUsername}</div>
          {authorFlair && <div class='MessageGroup-authorFlair'>{authorFlair}</div>}
          <TimeAgo date={dateCreated}/>
        </div>
        {messages.map(message => <div
          class={(!anticipatedGroup && message.anticipated) ? 'Message --anticipated' : 'Message'}
        >
          <div class='Message-content'>{message.text}</div>
          {showActions && !message.anticipated && <div class='Message-fillerLine'/>}
          {showActions && !message.anticipated && <div class='Message-actions'>
            <div class='Message-actions-action' title='Edit'><Icon icon='edit'/></div>
            <div class='Message-actions-action' title='Pin'><Icon icon='pin'/></div>
            <div class='Message-actions-action' title='Delete'><Icon icon='trash'/></div>
          </div>}
        </div>)}
      </div>
    </div>
  }
}

module.exports = Message
