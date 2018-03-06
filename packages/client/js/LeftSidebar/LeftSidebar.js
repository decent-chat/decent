const { h, Component } = require('preact')
const ServerList = require('./ServerList/ServerList')
const ChannelList = require('./ChannelList/ChannelList')

class LeftSidebar extends Component {
  render({ onJoinClick }) {
    
    return <aside class='Sidebar --on-left'>
      <ServerList onJoinClick={onJoinClick}/>
      <ChannelList/>
    </aside>
  }
}

module.exports = LeftSidebar