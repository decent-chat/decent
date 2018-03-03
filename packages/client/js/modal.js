const { h, Component } = require('preact')
const Portal = require('preact-portal')

class Modal extends Component {
  render(props, state) {
    // Renders into document.body rather than as an actual child
    return <Portal into='body'>
      <div>
        <div class='Modal'>
          <div class='Modal-close-button' onclick={props.cancel}></div>
          <div class='Modal-title'>
            {props.title}
            {props.subtitle && <span class='Modal-subtitle'>{props.subtitle}</span>}
          </div>
          <div class='Modal-content'>
            <div>{props.children}</div>
            {props.complete && <button class='Button' onclick={props.complete}>Save</button>}
          </div>
        </div>

        <div class='Modal-page-cover' onclick={props.cancel}></div>
      </div>
    </Portal>
  }
}

module.exports = Modal
