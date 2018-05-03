const { h, Component } = require('preact')
const Portal = require('preact-portal')
const Provider = require('preact-context-provider')

class Dropdown extends Component {
  render({ x, y, anchor = 'top', children }) {
    return <Portal into='body'>
      <Provider dropdown={this}><div>
        <div class='Dropdown' style={`${anchor}: ${y}px; left: ${x}px;`}>
          {children}
        </div>

        <div class='Dropdown-page-cover' onClick={this.close}></div>
      </div></Provider>
    </Portal>
  }

  close = () => {
    this.props.onClose()
  }
}

module.exports = Dropdown
