const html = require('choo/html')
const history = require('../util/history')
const Modal = require('../util/modal')

// template for user info
const userInfo = require('./user-info')

// template for a single server dropdown option
// intended to be called and then used in Array#map
const dropdownOption = emit => (server, index) => {
  return html`<div class='server-dropdown-option ${server.active ? 'active' : ''}' onclick=${switchToMe}>
    ${server.host}
  </div>`

  // switches to `server`
  function switchToMe() {
    emit('switch server', index)

    // server dropdown will be closed as a result of this click event bubbling
  }
}

// template for the 'server' section of the sidebar
module.exports = (state, emit) => {
  const server = state.servers[state.activeServer]
  const dropdownOpen = state.serverDropdownOpen

  return html`<div class='sidebar-section sidebar-section-server'>
    <div class='sidebar-subtitle'>
      <h4>Server</h4>
      <div class='sidebar-subtitle-button' onclick=${addServer}>+ Add</div>
    </div>

    <div class='server-dropdown ${dropdownOpen ? 'open' : ''}' onclick=${toggleDropdown}>
      <div class='server-dropdown-current'>${server.host}</div>
      <div class='server-dropdown-panel'>
        ${state.servers.map(dropdownOption(emit))}
      </div>
    </div>

    ${userInfo(state, emit)}
  </div>`

  // adds a server URL
  async function addServer() {
    const modal = new Modal({
      title: 'Add server',

      inputs: {
        // e.g. "localhost:3000"
        host: {
          label: 'Host',
        },
      },

      button: 'Add',
    })

    modal.on('submit', ({ host }) => {
      modal.close()

      emit('add server', host)
    })
  }

  // toggles the server dropdown
  function toggleDropdown() {
    emit('toggle server dropdown')
  }
}
