const html = require('choo/html')
const { api, Modal } = require('../../util')

const getLooks = () => {
  try {
    return JSON.parse(localStorage['preferences_looks'])
  } catch (err) {
    return {circleAvatars: false}
  }
}

const setLooks = looks => {
  localStorage['preferences_looks'] = JSON.stringify(looks)
  apply(looks)
}

const toggle = key => {
  const looks = getLooks()

  looks[key] = !looks[key]

  setLooks(looks)
}

const component = (state, emit) => {
  const looks = getLooks()

  return html`<div class='Page'>
    <h1 class='Page-title'>Looks</h1>

    <div class='Input --horizontal'>
      <label>Circle avatars</label>
      <input type='checkbox' ${looks.circleAvatars ? 'checked' : ''} onchange=${() => toggle('circleAvatars')}/>
    </div>
  </div>`
}

const apply = looks => {
  document.body.style.setProperty('--avatar-border-radius', looks.circleAvatars ? '100%' : '5%')
}

module.exports = {
  component,
  onload: () => apply(getLooks())
}
