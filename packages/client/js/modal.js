const { h, Component } = require('preact')
const Portal = require('preact-portal')
const Provider = require('preact-context-provider')
const findNodesOfType = require('./find-nodes')

class Modal extends Component {
  inputs = []

  render({ title, subtitle, onSubmit, onCancel, children }) {
    // Renders into document.body rather than as an actual child
    return <Portal into='body'>
      <Provider onSubmit={() => this.handleSubmit(onSubmit)} onCancel={() => onCancel()} inputs={this.inputs}>
        {!closed && <div>
          <div class='Modal'>
            <div class='Modal-close-button' onClick={() => onCancel()}></div>
            <div class='Modal-title'>
              {title}
              {subtitle && <span class='Modal-subtitle'>{subtitle}</span>}
            </div>
            <div class='Modal-content'>
              {children}
            </div>
          </div>

          <div class='Modal-page-cover' onClick={evt => this.requestCancel(evt)}></div>
        </div>}
      </Provider>
    </Portal>
  }

  handleSubmit(onSubmit) {
    onSubmit(this.inputs.reduce((map, [ name, value ]) => {
      map[name] = value
      return map
    }, {}))
  }
}

class Input extends Component {
  state = {value: null}

  componentDidMount() {
    this.context.inputs.push([this.props.name, this.state])
  }

  render({ label, type = 'text', placeholder = '' }) {
    return <div class='Input'>
      <label>{label}</label>
      <input type={type} onChange={evt => this.onChange(evt)} placeholder={placeholder}/>
    </div>
  }

  onChange({ target: input }) {
    this.setState({value: input.value})
  }
}

class Button extends Component {
  render(props) {
    return <a class={'Button' + (props.class || '')} onClick={() => {
      if (props.action === 'submit') this.context.onSubmit()
      else if (props.action === 'cancel') this.context.onCancel()
      else throw new TypeError('Modal.Button: props.action should be "submit" or "cancel"')
    }}>
      {props.children}
    </a>
  }
}

// Presentational - here if we decide to give errors behaviour for whatever reason.
class ModalError extends Component {
  render({ children: text }) {
    return <div class='Modal-error'>{text}</div>
  }
}

module.exports = Object.assign(Modal, {Input, Button, Error: ModalError})
