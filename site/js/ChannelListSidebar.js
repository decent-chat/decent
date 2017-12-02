import { post, get } from './api.js'

export default class ChannelListSidebar {
  constructor(elementSelector, socket) {
    this.el = document.querySelector(elementSelector)
    this.populateList().then(() => viewChannel(this.channels[0].id))

    socket.on('created new channel', () => this.populateList())
  }

  async viewChannel(channelID) {
    this.activeChannelID = channelID
    socket.emit('view channel', channelID)

    // TODO load current
  }

  async populateList() {
    const { channels } = get('/api/channel-list')
    console.log(channels)

    this.channels = []
  }
}
