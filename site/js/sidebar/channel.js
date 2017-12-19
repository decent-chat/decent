const html = require('choo/html')

const Modal = require('../util/modal')
const api = require('../util/api')
const history = require('../util/history')

// template for the '+ Create' button
const createBtn = (state, emit) => {
  // you must be an admin to create channels
  if (state.user && state.user.permissionLevel === 'admin') {
    return html`<div class='sidebar-subtitle-button' onclick=${createChannel}>+ Create</div>`
  } else {
    return html``
  }

  function createChannel() {
    const { host } = state.servers[state.activeServer]

    const modal = new Modal({
      title: 'Create channel',

      inputs: {
        channelName: { label: 'Channel name' },
      },

      button: 'Create',
    })

    modal.on('submit', async ({ channelName }) => {
      modal.disable()

      try {
        const { success } = await api.post(host, 'create-channel', {
          name: channelName.trim(),
          sessionID: state.sessionID,
        })

        modal.close()
      } catch (error) {
        if (error.message === 'name invalid') {
          modal.showError('Invalid name - can only contain a-z, 0-9,\nunderscores, and dashes')
        } else if (error.message === 'channel name already taken') {
          modal.showError(`#${channelName.trim()} already exists`)
        } else {
          console.error(error)
          modal.showError('Internal error')
        }

        modal.disable(false) // enable
      }
    })
  }
}

// template for a list item representing a channel
const listItem = (state, emit) => (channel, index) => {
  const classList = [ 'list-item', 'list-item-channel' ]

  if (channel.id === state.activeChannelID) classList.push('active')
  else if (channel.unreadMessageCount) classList.push('notification')

  return html`<a class=${classList.join(' ')} onclick=${select}>${channel.name}</a>`

  // sets the active server to this one
  function select() {
    const { host } = state.servers[state.activeServer]

    // let router handle it
    history.push(`/${host}/#${channel.name}`)
  }
}

// template for the 'channels' section of the sidebar
module.exports = (state, emit) => {
  return html`<div class='sidebar-section'>
    <div class='sidebar-subtitle'>
      <h4>Channels</h4>
      ${createBtn(state, emit)}
    </div>

    <div class='location-list'>
      ${state.channels.map(listItem(state, emit))}
    </div>
  </div>`
}
