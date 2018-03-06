const { h, Component } = require('preact')
const Portal = require('preact-portal')

class Toast extends Component {
  render({ children }) {
    return <Portal into='body'>
      <div class='Toast'>
        {children}
      </div>
    </Portal>
  }
}

module.exports = Toast
