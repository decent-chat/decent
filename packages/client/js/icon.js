const { h, Component } = require('preact')
const Markup = require('preact-markup')

class Icon extends Component {
  static icons = {
    users: require('../img/icons/users.svg'),
    mention: require('../img/icons/mention.svg'),
    pin: require('../img/icons/pin.svg'),
    unpin: require('../img/icons/unpin.svg'),
    edit: require('../img/icons/edit.svg'),
    cog: require('../img/icons/cog.svg'),
    message: require('../img/icons/message.svg'),
    //send: require('../img/icons/send.svg'),
    trash: require('../img/icons/trash.svg'),
    warning: require('../img/icons/warning.svg'),
    disconnect: require('../img/icons/disconnect.svg'),
  }

  render({ icon, class: className }) {
    const svg = Icon.icons[icon].replace('<svg', className ? ('<svg class=' + className) : '<svg')

    // Note that <Markup/> wraps the svg in <div class='markup'/>, which may not be desired
    return <Markup markup={svg} type='html'/>
  }
}

module.exports = Icon
