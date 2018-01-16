const html = require('bel')
const css = require('sheetify')

const Nanocomponent = require('nanocomponent')
const nonew = require('no-new')

const ServerList = require('./server-list')
const ChannelList = require('./channel-list')
const AuthState = require('./auth-state')

css('./index.css')

class Sidebar extends Nanocomponent {
  constructor (emitter) {
    super()
    this.emitter = emitter

    this.channelList = ChannelList(emitter)
    this.authState = AuthState(emitter)
    this.serverList = ServerList(emitter)
  }

  createElement () {
    return html`
      <aside id='sidebar'>
        ${this.serverList.render()}
        ${this.authState.render()}
        ${this.channelList.render()}
      </aside>
    `
  }

  update () { return true }
}

module.exports = nonew(Sidebar)
