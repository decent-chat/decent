// pretty Modal class. replaces window.prompt and friends

const Nanobus = require('nanobus')
const html = require('choo/html')

const constructStyledInput = (name, i, j) => {
  const id = `modal-input-${name}`

  return html`<div class='styledInput'>
    <label for=${id}>${i.label}</label>
    <input id=${id} type=${i.type || 'text'} placeholder=${i.placeholder || ''} tabindex=${j}/>
  </div>`
}

class Modal extends Nanobus {
  constructor(opts) {
    super('modal')

    const content = html`<div class='modal-content'></div>`

    // add inputs to content
    let j = 1
    this.styledInputs = []
    for (const [ name, i ] of Object.entries(opts.inputs)) {
      const inputEl = constructStyledInput(name, i, j++)

      this.styledInputs.push({ name, el: inputEl })
      content.appendChild(inputEl)
    }

    // hitting return on an input element should focus
    // the next, or submit the modal if it is last
    for (let i = 0; i < this.styledInputs.length; i++) {
      const { name, el } = this.styledInputs[i]
      const next = this.styledInputs[i + 1]
      const input = el.querySelector('input')

      input.addEventListener('keypress', evt => {
        // listen for enter/return keypress
        if (evt.which === 13) {
          evt.preventDefault()

          // if there's a next input, focus it
          // otherwise, submit this modal
          if (next) {
            next.el.querySelector('input').focus()
          } else {
            this.submit()
          }
        }
      })
    }

    // add submit button to content
    const btn = html`<input type='submit' class='styledButton' value=${opts.button || 'Submit'} onclick=${this.submit.bind(this)} tabindex=${j}>`
    content.appendChild(btn)

    // add error element
    // TODO style this better! this is a feature PJ's codepen didn't have
    this.errorEl = html`<div class='modal-error'></div>`
    content.prepend(this.errorEl)

    // construct #modal element
    this.el = html`<div class='modal'>
      <div class='modal-close-button' onclick=${this.close.bind(this)}></div>
      <div class='modal-header'>${opts.title} <span class="modal-header-subtitle">${opts.subtitle || ''}</span></div>
      ${content}
    </div>`

    // darken page cover
    const pageCover = document.querySelector('.modal-page-cover')
    pageCover.onclick = this.close.bind(this) // close on click
    pageCover.classList.add('visible')

    // show the modal
    this.visible = true
    document.body.insertBefore(this.el, pageCover)
    this.focus()

    this.opts = opts
  }

  focus() {
    // focus on the FIRST input
    // tabindex is set so people can then use tab to select the next one
    this.styledInputs[0].el.querySelector('input').focus()
  }

  get values() {
    // map of input id to its current value
    const map = {} // we _would_ use a Map here but then you can't destructure it

    for (const { name, el } of this.styledInputs) {
      map[name] = el.querySelector('input').value
    }

    return map
  }

  showError(message) {
    // display an error message
    this.errorEl.innerText = message
  }

  submit() {
    // submit the modal -- don't close it
    // this only means emitting the 'submit' event
    this.emit('submit', this.values)
  }

  close() {
    // close the modal
    this.visible = false
    this.el.remove()

    // darken page cover
    const pageCover = document.querySelector('.modal-page-cover')
    pageCover.classList.remove('visible')

    this.emit('close')
  }
}

module.exports = Modal
