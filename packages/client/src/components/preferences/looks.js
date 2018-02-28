const html = require('choo/html')
const { api, Modal } = require('../../util')

const component = (state, emit) => {
  return html`<div class='Page'>
    <h1 class='Page-title'>Looks</h1>

    <p>yeet</p>
  </div>`
}

module.exports = { component }
