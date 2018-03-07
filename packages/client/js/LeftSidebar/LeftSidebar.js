const { h, Component } = require('preact')
const ServerList = require('./ServerList')
const ChannelList = require('./ChannelList')

class LeftSidebar extends Component {
  render({ onJoinClick }) {
    
    return <aside class='Sidebar --on-left'>
      <ServerList onJoinClick={onJoinClick}/>
      <ChannelList/>
    </aside>
  }
}

module.exports = LeftSidebar
