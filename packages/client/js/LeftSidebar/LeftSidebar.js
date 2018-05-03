const { h, Component } = require('preact')
const ServerDetails = require('./ServerDetails')
const ChannelList = require('./ChannelList')
const SessionInfo = require('./SessionInfo')

class LeftSidebar extends Component {
  render({ onJoinClick, toggleServerList }) {

    return <aside class='Sidebar --on-left'>
      <ServerDetails toggleServerList={toggleServerList} onAddServer={onJoinClick}/>
      <ChannelList/>

      <div class='Sidebar-spacer'></div>

      <SessionInfo />
    </aside>
  }
}

module.exports = LeftSidebar
