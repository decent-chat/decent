const { h, Component } = require('preact')
const Portal = require('preact-portal')
const Provider = require('preact-context-provider')

class Dropdown extends Component {
  state = {x: 0, y: 0, ok: false}

  handlePlaced = el => {
    if (this.state.ok === true) return

    setTimeout(() => {
      const { width, height } = el.getBoundingClientRect()

      if (this.props.anchorH === 'right') {
        this.props.x = document.body.clientWidth - this.props.x
      }

      if (this.props.anchor === 'bottom') {
        this.props.y = document.body.clientHeight - this.props.y
      }

      this.setState({
        ok: true,
        x: Math.min(this.props.x, document.body.clientWidth - width),
        y: Math.min(this.props.y, document.body.clientHeight - height),
      })
    }, 1)
  }

  render({ anchor = 'top', anchorH = 'left', children }, { x, y, ok }) {
    const style = {
      opacity: ok ? '1.0' : '0.0 !important',
      [anchor]: y,
      [anchorH]: x,
    }

    return <Portal into='body'>
      <Provider dropdown={this}><div>
        <div class='Dropdown' style={style} ref={this.handlePlaced}>
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
