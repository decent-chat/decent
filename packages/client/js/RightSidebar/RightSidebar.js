const { h, Component } = require('preact')
const Icon = require('/Icon')
const UserList = require('./UserList')

class RightSidebar extends Component {
  render({ }) {
    return <aside class='Sidebar --on-right'>
      <div class='Tabs'>
        <div class='Tabs-tab --is-active'>
          <Icon icon='users' class='Tabs-tab-icon'/>
          <span class='Tabs-tab-text'>Users</span>
        </div>
        <div class='Tabs-tab'>
          <Icon icon='mention' class='Tabs-tab-icon'/>
          <span class='Tabs-tab-text'>Mentions</span>
        </div>
        <div class='Tabs-tab'>
          <Icon icon='pin' class='Tabs-tab-icon'/>
          <span class='Tabs-tab-text'>Pins</span>
        </div>
      </div>

      <UserList/>
    </aside>
  }
}

module.exports = RightSidebar
