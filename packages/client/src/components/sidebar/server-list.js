const html = require('bel')
const { noop, Modal, storage, api } = require('../../util')

const Nanocomponent = require('nanocomponent')
const Machine = require('nanostate')
const nonew = require('no-new')

// note: emits a global event called 'switchhost'
class ServerList extends Nanocomponent {
  constructor (emitter) {
    super()
    this.emitter = emitter

    this.machine = Machine('closed', {
      closed: { open: 'opened' },
      opened: { close: 'closed' }
    })

    this.machine.on('close', () => emitter.emit('render'))
    this.machine.on('open', () => emitter.emit('render'))

    document.addEventListener('click', ev => {
      if (this.machine.state === 'opened') {
        this.machine.emit('close')
      }
    })

    this.hosts = storage.get('servers') || []
    this.switchTo(this.hosts[0] || null)

    this._cache = {}
    this.update() // set cache
  }

  createElement () {
    if (this.empty) {
      return html`
        <section class='server-list'>
          <div class='subtitle'>
            <h4>Servers</h4>
            <button
              class='wiggle'
              onclick=${() => this.join()}
            >
              + Join
            </button>
          </div>

          <div class='server-list empty'>
            You're not connected to any servers. Join one now!
          </div>
        </section>
      `
    }

    const panel = this.machine.state === 'opened' ? html`
      <div class='panel'>
        ${this.hosts.map(host => html`
          <div
            class='option ${host === this.activeHost ? 'active' : ''}'
            onclick=${ev => this.switchTo(host)}
          >
            ${host}
          </div>
        `)}
      </div>
    ` : []

    const loneHost = this.activeHost && this.hosts.length === 1
    const clickable = !loneHost && this.machine.state === 'closed'

    return html`
      <section>
        <div class='subtitle'>
          <h4>Servers</h4>
          <button onclick=${() => this.join()}>
            + Join
          </button>
        </div>

        <div
          class='server-list ${this.machine.state === 'opened' ? 'open' : ''} ${clickable ? '': 'no-click'}'
          onclick=${clickable ? ev => { this.machine.emit('open'); ev.stopPropagation()}: noop}
        >
          <div>${this.activeHost || 'Select a server...'}</div>
          ${panel || []}
        </div>
      </section>
    `
  }

  update () {
    const shouldUpdate = this.hosts.toString() !== this._cache.hosts ||
      this.activeHost !== this._cache.activeHost ||
      this.machine.state !== this._cache.machineState

    this._cache = {
      hosts: this.hosts.toString(),
      activeHost: this.activeHost,
      machineState: this.machine.state
    }

    return shouldUpdate
  }

  get empty () { return this.hosts.length === 0 }

  join () {
    const modal = Modal({
      title: 'Join server',

      inputs: {
        // e.g. "localhost:3000"
        host: { label: 'Host' }
      },

      button: 'Join'
    })

    modal.on('submit', async ({ host }) => {
      modal.disable()

      // check host is a decent server
      try {
        const { decent } = await window.fetch(`//${host}/api/`)
          .then(res => res.json())

        if (!decent) {
          throw new Error('not a decent server')
        }

        // it's a decent server!
        modal.close()

        if (host && !this.hosts.includes(host)) {
          // add the server
          this.hosts.push(host)
          storage.set('servers', this.hosts)
        }

        // switch to it
        this.switchTo(host)
      } catch (error) {
        if (/(not a valid URL|NetworkError|JSON)/i.test(error.message)) {
          modal.showError('Failed to connect (not a Decent server?)')
        } else if (error.message === 'not a decent server') {
          modal.showError('Not a Decent server')
        } else {
          console.error(error)
          modal.showError('Internal error')
        }

        modal.disable(false)
        modal.focus()
      }
    })
  }

  switchTo (host) {
    if (this.activeHost === host) return

    this.activeHost = host

    api.setHost(host)
    this.emitter.emit('switchhost', host)

    this.emitter.emit('render')
  }
}

module.exports = nonew(ServerList)
