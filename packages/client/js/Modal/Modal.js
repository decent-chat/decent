const { h, Component } = require('preact')
const Portal = require('preact-portal')
const Provider = require('preact-context-provider')

class Modal extends Component {
  inputs = {}

  render({ title, subtitle, isLoading, children, cancellable = true }) {    
    // Renders into document.body rather than as an actual child
    return <Portal into='body'>
      <Provider
        modalSubmit={this.handleSubmit}
        modalCancel={this.handleCancel}
        modalUpdateInput={this.handleInputUpdate}
      >
        {!closed && <div>
          <div class={'Modal' + (isLoading ? ' is-loading' : '')}>
            {cancellable ? <div class='Modal-close-button' onClick={this.handleCancel}></div> : <div />}
            <div class='Modal-title'>
              {title}
              {subtitle && <span class='Modal-subtitle'>{subtitle}</span>}
            </div>
            <div class='Modal-content'>
              {children}
            </div>
          </div>

          <div class='Modal-page-cover' onClick={this.handleCancel}></div>
        </div>}
      </Provider>
    </Portal>
  }

  handleSubmit = () => {
    this.props.onSubmit(this.inputs)
  }
 
  handleCancel = () => {
    this.props.onCancel()
  }
 
  handleInputUpdate = (name, value) => {
    this.inputs[name] = value
  }
}

class AsyncModal extends Component {
  state = {isLoading: false, errorMessage: null}

  render({ title, subtitle, children, cancellable }, { isLoading, errorMessage }) {
    return <Modal
      title={title}
      subtitle={subtitle}
      cancellable={cancellable}
      isLoading={isLoading}
      onCancel={this.handleCancel}
      onSubmit={this.handleSubmit}
    >
      {errorMessage && <ModalError>{errorMessage}</ModalError>}
      {children}
    </Modal>
  }

  handleSubmit = data => {
    this.setState({isLoading: true, errorMessage: null})
 
    this.props.submit(data).then(() => this.props.onHide()).catch(error => {
      console.error('Error in <AsyncModal submit/> handler:', error)
      this.setState({isLoading: false, errorMessage: error.message || error})
    })
  }
 
  handleCancel = () => {
    this.props.onHide()
  }
}

class Input extends Component {
  state = {value: null}

  inputRef = ref => this.input = ref

  componentDidMount() {
    const { value } = this.input
    this.context.modalUpdateInput(this.props.name, value)
  }

  render({ label, type = 'text', placeholder = '' }, { value }) {
    return <div class='Modal-input Input'>
      <label>{label}</label>
      <input
        ref={this.inputRef}
        type={type}
        placeholder={placeholder}
        value={value}

        onInput={this.handleChange}
        onChange={this.handleChange}
        onKeyDown={this.handleKey}
      />
    </div>
  }

  handleChange = e => {
    const { value } = e.target
 
    this.setState({value})
    this.context.modalUpdateInput(this.props.name, value)
  }

  handleKey = e => {
    // TODO
  }
}

class Button extends Component {
  render(props) {
    return <button class={'Modal-button Button' + ((' ' + props.class) || '')} onClick={this.handleClick}>
      {props.children}
    </button>
  }

  handleClick = e => {
    const { action } = this.props
 
    if (action === 'submit') this.context.modalSubmit(e)
    else if (action === 'cancel') this.context.modalCancel(e)
    else throw new TypeError('<Modal.Button action/> should be "submit" or "cancel"')
  }
}

// Presentational - here if we decide to give errors behaviour for whatever reason.
class ModalError extends Component {
  render({ children: text }) {
    return <div class='Modal-error'>{text}</div>
  }
}

module.exports = Object.assign(Modal, {Async: AsyncModal, Input, Button, Error: ModalError})
