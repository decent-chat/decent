// pretty modals. replaces window.prompt and friends

const html = require('choo/html')
const raw = require('choo/html/raw')

const input = (name, i, j) => {
  const id = `modal-input-${name}`

  return html`<div class='styledInput'>
    <label for=${id}>${i.label}</label>
    <input id=${id} type=${i.type || 'text'} placeholder=${i.placeholder || ''} tabindex=${j}/>
  </div>`
}

const prompt = opts => new Promise((resolve, reject) => {
  // construct content
  const content = html`<div class='modal-content'></div>`

  // add inputs to content
  let j = 1
  for (const [ name, i ] of Object.entries(opts.inputs)) {
    content.appendChild(input(name, i, j++))
  }

  // add submit button to content
  const btn = html`<input type='submit' class='styledButton' value=${opts.button || 'Submit'} onclick=${submit} tabindex=${j}>`
  content.appendChild(btn)

  // add error element
  if (opts.error) {
    const errorEl = html`<div class='modal-error'>${opts.error}</div>`
    content.prepend(errorEl)
  }

  // construct modal element
  const el = html`<div class='modal'>
    <div class='modal-close-button' onclick=${close}></div>
    <div class='modal-header'>${opts.title} <span class="modal-header-subtitle">${opts.subtitle || ''}</span></div>
    ${content}
  </div>`

  // append modal to document
  document.body.appendChild(el)

  // darken page cover
  const pageCover = document.querySelector('.modal-page-cover')
  pageCover.onclick = close // close on click
  pageCover.classList.add('visible')

  function submit(evt) {
    evt.preventDefault()

    // get input values
    const inputValues = {}
    for (const name of Object.keys(opts.inputs)) {
      const id = `modal-input-${name}`
      const inputEl = document.getElementById(id)

      inputValues[name] = inputEl.value
    }

    // resolve promise
    if (opts.closeOnSubmit === false) {
      resolve({
        data: inputValues,

        close() {
          el.remove()
          pageCover.classList.remove('visible')
        },

        // the fact that prompt uses a Promise means we can't re-resolve it. this is bad,
        // especially for when closeOnSubmit is true. TODO figure out a solution for this!
        //
        // this should probably use choo to keep its state. this function was hastilly written
        // at 3am, so it's probably not going to be the *most* well-designed ;)
      })
    } else {
      // hide page cover & modal el
      el.remove()
      pageCover.classList.remove('visible')

      resolve(inputValues)
    }
  }

  function close(evt) {
    evt.preventDefault()

    // hide page cover & modal el
    el.remove()
    pageCover.classList.remove('visible')

    // reject promise
    reject('modal closed')
  }
})

module.exports = { prompt }
