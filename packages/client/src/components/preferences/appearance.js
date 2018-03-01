const html = require('choo/html')
const { api, Modal } = require('../../util')

const getAppearance = () => {
  try {
    return JSON.parse(localStorage['preferences_appearance'])
  } catch (err) {
    return {circleAvatars: false, theme: 'dark'}
  }
}

const setAppearance = appearance => {
  localStorage['preferences_appearance'] = JSON.stringify(appearance)
  apply(appearance)
}

const setCSS = (el, props) => {
  document.body.style = '' // Reset.

  for (let [ prop, value ] of Object.entries(props)) {
    el.style.setProperty(prop, value)
  }
}

const toggle = key => {
  const appearance = getAppearance()

  appearance[key] = !appearance[key]

  setAppearance(appearance)
}

const set = (key, value) => {
  const appearance = getAppearance()

  appearance[key] = value

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

    <div class='Input --horizontal'>
      <label>Theme</label>
      ${(() => {
        const select = document.createElement('select')
        const themes = {light: 'Light', dark: 'Dark'} // TODO: midnight theme (#000000)

        for (let [ id, name ] of Object.entries(themes)) {
          const option = document.createElement('option')

          option.value = id
          option.appendChild(document.createTextNode(name))

          if (appearance.theme === id) option.selected = true

          select.appendChild(option)
        }

        select.addEventListener('change', () => set('theme', select.value))

        return select
      })()}
    </div>
  </div>`
}

const apply = appearance => {
  const themes = {
    light: {
      // Default - defined in the CSS.
    },
    dark: {
      '--red': '#f82030',
      '--accent': '#3c4144',

      '--modal-bg': 'var(--gray-100)',
      '--modal-header-fg': 'var(--gray-500)',
      '--modal-header-bg': '#25292f',
      '--modal-header-dim-fg': 'var(--gray-300)',

      '--sidebar-bg': '#25292f',
      '--sidebar-border-color': 'var(--gray-100)',

      '--sidebar-list-item-fg': 'var(--gray-300)',
      '--sidebar-list-item-bg': 'transparent',

      '--sidebar-list-item-hoverfg': 'var(--gray-500)',
      '--sidebar-list-item-hoverbg': 'var(--gray-100)',

      '--sidebar-list-item-activefg': 'var(--gray-700)',
      '--sidebar-list-item-activebg': 'var(--gray-100)',

      '--serverDropdown-fg': 'var(--gray-300)',
      '--serverDropdown-bg': '#1c1e23',

      '--serverDropdown-item-hoverfg': 'var(--gray-500)',
      '--serverDropdown-item-hoverbg': '#25292f',

      '--serverDropdown-item-activefg': 'var(--gray-700)',
      '--serverDropdown-item-activebg': '#25292f',

      '--tab-fg': 'var(--gray-300)',
      '--tab-bg': '#1c1e23',
      '--tab-border-color': 'var(--gray-100)',

      '--tab-activefg': 'var(--gray-500)',
      '--tab-activebg': '#25292f',

      '--page-fg': 'var(--gray-500)',
      '--page-bg': 'var(--gray-100)',
      '--page-alt-bg': 'var(--gray-100)',
      '--page-title-fg': 'var(--gray-700)',

      '--table-border-color': '#2c333f',
      '--table-bg': '#25292f',

      '--messageEditor-fg': 'var(--gray-700)',
      '--messageEditor-bg': 'var(--page-bg)',
      '--messageEditor-border-color': '#3c4144',

      '--input-fg': 'var(--gray-700)',
      '--input-bg': 'var(--gray-100)',
      '--input-border-color': '#3c4144',
      '--input-disabled-bg': '#3c4144',

      '--flair-bg': '#25292f',
      '--flair-fg': 'var(--gray-500)',

      '--mention-of-you-fg': '#f6e416',
      '--mention-of-you-bg': 'rgba(246, 228, 22, 0.2)',

      '--loading-icon': 'url("../img/message-solid-white.svg")',
    },
  }

  setCSS(document.body, Object.assign({
    '--avatar-border-radius': appearance.circleAvatars ? '100%' : '5%',
  }, themes[appearance.theme]))
}

module.exports = {
  component,
  onload: () => apply(getAppearance())
}
