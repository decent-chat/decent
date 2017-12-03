import Actor from './Actor.js'
import { get, post } from './api.js'

export default class ModalsActor extends Actor {
  init() {
    this.backlog = []
    this.activeModal = null
  }

  // Shows an alert, similar to
  // window.alert but looking nicer.
  // Also, is non-blocking.
  alert(title, desc = '', btnText = 'OK') {
    return new Promise(resolve => {
      this.backlog.push({
        title, desc,
        buttons: [
          {
            primary: true,
            text: btnText,
            onclick: resolve,
          },
        ],
        defaultAction: 0,
        cancelAction: 0,
      })

      this.displayModalsFromBacklog()
    })
  }

  // ModalsActor#alert but for window.prompt.
  prompt(title,
         desc = '',
         placeholder = '',
         validateFn = () => Promise.resolve(),
         btnOkText = 'Done',
         btnCancelText = 'Cancel', inputType = 'text') {
    return new Promise((resolve, reject) => {
      this.backlog.push({
        title, desc,
        input: { type: inputType, placeholder, validateFn },
        buttons: [
          {
            text: btnCancelText,
            onclick: () => reject('modal closed'),
          },

          {
            primary: true,
            doValidate: true,

            text: btnOkText,
            onclick: resolve,
          },
        ],
        defaultAction: 1,
        cancelAction: 0,
      })

      this.displayModalsFromBacklog()
    })
  }

  displayModalsFromBacklog() {
    if (this.backlog.length === 0 || this.activeModal !== null) {
      return false
    }

    const modalData = this.backlog.pop()
    this.activeModal = modalData

    const modalEl = document.createElement('div')
    modalEl.classList.add('modal')

    const titleEl = document.createElement('h2')
    titleEl.classList.add('modal-title')
    titleEl.appendChild(document.createTextNode(modalData.title))

    modalEl.appendChild(titleEl)

    if (modalData.desc) {
      const descEl = document.createElement('p')
      descEl.classList.add('modal-desc')
      descEl.appendChild(document.createTextNode(modalData.desc))

      modalEl.appendChild(descEl)
    }

    let errorEl, inputEl
    if (modalData.input) {
      errorEl = document.createElement('span')
      errorEl.classList.add('modal-error')

      modalEl.appendChild(errorEl)

      inputEl = document.createElement('input')
      inputEl.classList.add('modal-input')
      inputEl.classList.add('input')
      inputEl.placeholder = modalData.input.placeholder || ''
      inputEl.type = modalData.input.type || 'text'

      modalEl.appendChild(inputEl)
    }

    const captureKeypress = evt => {
      if (evt.keyCode === 13) {
        // Return/enter key, perform defaultAction
        // note: also serves to capture enter keypress in inputEl
        const btn = modalData.buttons[modalData.defaultAction]

        if (btn) {
          btn.el.click()
        }
      } else if (evt.keyCode === 27) {
        // Escape key, perform cancelAction
        const btn = modalData.buttons[modalData.cancelAction]

        if (btn) {
          btn.el.click()
        }
      }
    }

    const actionsEl = document.createElement('div')
    actionsEl.classList.add('modal-actions')
    for (const btnData of modalData.buttons) {
      const btnEl = document.createElement('button')
      btnEl.classList.add('btn')

      if (btnData.primary) {
        btnEl.classList.add('btn-primary')
      }

      btnData.el = btnEl
      btnEl.appendChild(document.createTextNode(btnData.text))

      btnEl.addEventListener('click', async evt => {
        evt.preventDefault()

        // Validate form
        if (inputEl && modalData.input.validateFn && btnData.doValidate) {
          try {
            await modalData.input.validateFn(inputEl.value || inputEl.placeholder)
          } catch (error) {
            // Display error

            errorEl.innerText = error
            this.emit('modal validation error', error)

            return
          }
        }

        // Close the modal
        document.removeEventListener('keydown', captureKeypress)
        modalEl.remove()
        this.emit('close modal', modalData, modalEl)
        document.getElementById('app').classList.remove('modal-visible')

        // Trigger callback
        if (inputEl) {
          if (inputEl.value.length === 0) {
            // Use placeholder as default
            btnData.onclick(inputEl.placeholder)
          } else {
            btnData.onclick(inputEl.value)
          }
        } else {
          btnData.onclick(btnData.text)
        }

        // Continue displaying modals from the backlog
        this.activeModal = null
        this.displayModalsFromBacklog()
      })

      actionsEl.appendChild(btnEl)
    }

    modalEl.appendChild(actionsEl)

    // Show modal
    document.getElementById('app').classList.add('modal-visible')
    document.body.appendChild(modalEl)
    this.emit('display modal', modalData, modalEl)

    document.addEventListener('keydown', captureKeypress)

    if (inputEl) {
      inputEl.focus()
    }

    return { modalEl, modalData }
  }
}
