const { h, Component } = require('preact')
const Icon = require('/Icon')
const TimeAgo = require('./Timeago')
const MessageEditor = require('../MessageEditor')

// Note that this component supports both message groups (Array<Message>) *and*
// lone messages (Message).
class Message extends Component {
  // TODO: markdown

  state = {editing: null}

  componentDidMount() {
    const messages = Array.isArray(this.props.msg) ? this.props.msg : [this.props.msg]

    for (const message of messages) {
      message.on('delete', () => this.forceUpdate())
      message.on('change', () => this.forceUpdate())
    }

    this.context.pool.activeClientEE.on('login',  this.forceUpdate)
    this.context.pool.activeClientEE.on('logout', this.forceUpdate)
  }

  render({ msg, showActions = true }, { editing }) {
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
        {messages.map(message => {
          if (editing === message.id) {
            return <div
              id={'msg-' + message.id}
              class='Message is-being-edited'
            >
              <MessageEditor
                focus inline allowUploads={false}
                content={message.text}

                sendMessage={async text => {
                  this.setState({editing: null})
                  await message.edit(text)
                }}
                cancel={() => this.setState({editing: null})}
              />
            </div>
          } else {
            return <div
              id={'msg-' + message.id}
              class={(!anticipatedGroup && message.anticipated) ? 'Message --anticipated' : 'Message'}
            >
              <div class='Message-content'>{message.text}</div>
              {showActions && !message.anticipated && <div class='Message-fillerLine'/>}
              {showActions && !message.anticipated && <div class='Message-actions'>
                <div class='Message-actions-action' title='Edit' onClick={this.edit(message)}><Icon icon='edit'/></div>
                <div class='Message-actions-action' title='Pin' onClick={() => message.pin()}><Icon icon='pin'/></div>
                <div class='Message-actions-action' title='Delete' onClick={() => message.delete()}><Icon icon='trash'/></div>
              </div>}
            </div>
          }
        })}
      </div>
    </div>
  }

  edit = message => () => {
    this.setState({editing: message.id})
  }
}

module.exports = Message
