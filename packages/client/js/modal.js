const { h, Component } = require('preact')
const Portal = require('preact-portal')
const Provider = require('preact-context-provider')

class Modal extends Component {
  inputs = []

  render({ title, subtitle, onSubmit, onCancel, isLoading, children }) {
    // Renders into document.body rather than as an actual child
    return <Portal into='body'>
      <Provider onSubmit={() => this.handleSubmit(onSubmit)} onCancel={() => onCancel()} inputs={this.inputs = []}>
        {!closed && <div>
          <div class={'Modal' + (isLoading ? ' is-loading' : '')}>
            <div class='Modal-close-button' onClick={() => onCancel()}></div>
            <div class='Modal-title'>
              {title}
              {subtitle && <span class='Modal-subtitle'>{subtitle}</span>}
            </div>
            <div class='Modal-content'>
              {children}
            </div>
          </div>

          <div class='Modal-page-cover' onClick={() => onCancel()}></div>
        </div>}
      </Provider>
    </Portal>
  }

  // FIXME: this.inputs is [] if this is not the first time this fn was run
  handleSubmit(onSubmit) {
    onSubmit(this.inputs.reduce((map, [ name, input ]) => {
      map[name] = input.state.value
      return map
    }, {}))
  }
}

class AsyncModal extends Component {
  state = {isLoading: false, errorMessage: null}

  render({ title, subtitle, submit, onHide, children }, { isLoading, errorMessage }) {
    return <Modal
      title={title}
      subtitle={subtitle}
      isLoading={isLoading}
      onCancel={() => onHide()}
      onSubmit={data => {
        this.setState({isLoading: true, errorMessage: null})

        return submit(data).then(() => onHide()).catch(error => {
          console.error(error)
          this.setState({isLoading: false, errorMessage: error.message || error})
        })
      }}
    >
      {errorMessage && <ModalError>{errorMessage}</ModalError>}
      {children}
    </Modal>
  }
}

let inputCount = 0
class Input extends Component {
  id = 'modal-input-' + inputCount++
  state = {value: null}

  componentDidMount() {
    this.state.value = document.getElementById(this.id).value // XXX
    this.context.inputs.push([this.props.name, this])
  }

  shouldComponentUpdate() {
    return false
  }

  render({ label, type = 'text', placeholder = '' }) {
    const { id } = this

    return <div class='Modal-input Input'>
      <label for={id}>{label}</label>
      <input id={id} type={type} onChange={evt => this.onChange(evt)} placeholder={placeholder}/>
    </div>
  }

  onChange({ target: input }) {
    this.setState({value: input.value})
  }
}

class Button extends Component {
  render(props) {
    return <button class={'Modal-button Button' + ((' ' + props.class) || '')} onClick={() => {
      if (props.action === 'submit') this.context.onSubmit()
      else if (props.action === 'cancel') this.context.onCancel()
      else throw new TypeError('Modal.Button: props.action should be "submit" or "cancel"')
    }}>
      {props.children}
    </button>
  }
}

// Presentational - here if we decide to give errors behaviour for whatever reason.
class ModalError extends Component {
  render({ children: text }) {
    return <div class='Modal-error'>{text}</div>
  }
}

module.exports = Object.assign(Modal, {Async: AsyncModal, Input, Button, Error: ModalError})
