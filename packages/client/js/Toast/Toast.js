const { h, Component } = require('preact')
const Portal = require('preact-portal')

class Toast extends Component {
  render({ children, color = 'default' }) {
    return <Portal into='body'>
      <div class={Toast.colorClass[color]}>
        {children}
      </div>
    </Portal>
  }

  static colorClass = {
    default: 'Toast',
    red: 'Toast --red'
  }
}

module.exports = Toast
