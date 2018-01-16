const html = require('bel')
const api = require('../../util/api')

const Nanocomponent = require('nanocomponent')
const Machine = require('nanostate')
const nonew = require('no-new')

// note: emits a global event called 'switchchannel'
class ChannelList extends Nanocomponent {
  constructor (emitter) {
    super()
    this.emitter = emitter

    this.channels = []
    this.activeChannelID = null

    this.machine = Machine('unloaded', {
      unloaded: { fetch: 'fetching', reset: 'unloaded' },
      fetching: { done: 'loaded', error: 'errored' },
      loaded: { fetch: 'fetching', reset: 'unloaded' },
      errored: { fetch: 'fetching', reset: 'unloaded' }
    })

    this.machine.on('done', () => this.emitter.emit('render'))
    this.machine.on('error', () => this.emitter.emit('render'))
    this.machine.on('reset', () => this.emitter.emit('render'))

    this.machine.on('fetch', async () => {
      this.emitter.emit('render')

      try {
        const { channels } = await api.get('channel-list')

        this.channels = channels
        this.machine.emit('done')

        // default to first channel, if possible
        const defaultChannel = this.channels[0]

        if (defaultChannel) {
          this.switchTo(defaultChannel.id)
        }
      } catch (error) {
        console.error(error)
        this.machine.emit('error')
      }
    })

    this.emitter.on('switchhost', () => this.machine.emit('reset'))
    this.emitter.on('updatesession', sess => {
      if (sess === null) {
        this.machine.emit('reset')
      } else {
        this.machine.emit('fetch')
      }
    })

    this.emitter.on('ws:active:message/new', message => {
      const channel = this.channels.find(c => c.id === message.channelID)
      channel.unreadMessageCount = channel.unreadMesageCount + 1 || 1

      this.emitter.emit('render')
    })

    this.emitter.on('ws:active:channel/new', ({ channel }) => {
      this.channels.push(channel)

      this.emitter.emit('render')
    })

    this.emitter.on('ws:active:channel/rename', ({ channelID, newName }) => {
      const channel = this.channels.find(c => c.id === channelID)
      channel.name = newName

      this.emitter.emit('render')
    })

    this.emitter.on('ws:active:channel/delete', ({ channelID }) => {
      this.channels = this.channels.filter(c => c.id === channelID)

      this.emitter.emit('render')
    })

    this._cache = {}
    this.update() // set cache
  }

  createElement () {
    if (this.machine.state === 'unloaded') {
      return html`
        <section>
          <!-- channel list -->
        </section>
      `
    }

    if (this.machine.state === 'fetching') {
      return html`
        <section>
          <div class='subtitle'>
            <h4>Channels</h4>
          </div>

          <span class='msg'>Loading...</span>
        </section>
      `
    }

    if (this.machine.state === 'errored') {
      return html`
        <section>
          <div class='subtitle'>
            <h4>Channels</h4>
          </div>

          <span class='msg'>Failed to load :(</span>
        </section>
      `
    }

    return html`
      <section>
        <div class='subtitle'>
          <h4>Channels</h4>
          ${api.session && api.session.user.permissionLevel === 'admin' ? html`
            <button
              class=${this.channels.length === 0 ? 'wiggle' : ''}
              onclick=${() => this.createChannel}
            >
              + Create
            </button>
          ` : html`<span></span>`}
        </div>

        <div class='list'>
          ${this.channels.length === 0 ? html`
            <div class='msg' style='text-align: center'>This server is empty! :(</div>
          ` : this.channels.map(channel => {
            const classList = [ 'item', 'channel' ]

            if (channel.id === this.activeChannelID) classList.push('active')
            if (channel.unreadMessageCount) classList.push('unread')

            return html`
              <a
                class=${classList.join(' ')}
                onclick=${() => this.switchTo(channel.id)}
              >
                ${channel.name}
              </a>
            `
          })}
        </div>
      </section>
    `
  }

  update () { return true }

  switchTo (id) {
    if (this.activeChannelID === id) return

    console.log('sidebar: switched channel to', { id })

    this.activeChannelID = id

    this.emitter.emit('switchchannel', id)
    this.emitter.emit('render')
  }
}

module.exports = nonew(ChannelList)
