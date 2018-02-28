const html = require('choo/html')
const { api, Modal } = require('../../util')

const getAppearance = () => {
  try {
    return JSON.parse(localStorage['preferences_appearance'])
  } catch (err) {
    return {circleAvatars: false}
  }
}

const setAppearance = appearance => {
  localStorage['preferences_appearance'] = JSON.stringify(appearance)
  apply(appearance)
}

const toggle = key => {
  const appearance = getAppearance()

  appearance[key] = !appearance[key]

  setAppearance(appearance)
}

const component = (state, emit) => {
  const appearance = getAppearance()

  return html`<div class='Page'>
    <h1 class='Page-title'>Appearance</h1>

    <div class='Input --horizontal'>
      <label>Circle avatars</label>
      <input type='checkbox' ${appearance.circleAvatars ? 'checked' : ''} onchange=${() => toggle('circleAvatars')}/>
    </div>
  </div>`
}

const apply = appearance => {
  document.body.style.setProperty('--avatar-border-radius', appearance.circleAvatars ? '100%' : '5%')
}

module.exports = {
  component,
  onload: () => apply(getAppearance())
}
