const { h, Component } = require('preact')

class Modal extends Component {
  render(props, state) {
    // Would love to use a fragment here, but preact doesn't support them
    return (
      <div>
        <div class='Modal'>
          <div class="Modal-close-button" onclick={props.cancel}></div>
          <div class="Modal-title">
            {props.title}
            {props.subtitle && <span class="Modal-subtitle">{props.subtitle}</span>}
          </div>
          <div class="Modal-content">
            <div>{props.children}</div>
            {props.complete && <button class="Button" onclick={props.complete}>Save</button>}
          </div>
        </div>
        <div class="Modal-page-cover" onclick={props.cancel}></div>
      </div>
    )
  }
}

module.exports = Modal
