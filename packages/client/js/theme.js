const theme = {
  light: {
    // Default - defined in the css/app.css
    className: 'theme-light',
  },
  dark: {
    className: 'theme-dark',

    [0]: 0x000000,
    [1]: 0x040404,
    [2]: 0x1c1f24,
    [3]: 0x3f3f3f,
    [4]: 0x565656,
    [5]: 0xb7b7b7,
    [6]: 0xe3e3e3,
    [7]: 0xd9d9d9,
    [8]: 0xfefefe,
    [9]: 0xf29333,
    'A': 0xf8ca12,
    'B': 0x37b349,
    'C': 0xa62139,
    'D': 0x0e5a94,
    'E': 0x91c7a9,
    'F': 0x7a2d00,
  },
}

function apply(styles) {
  document.body.style = '' // Reset.
  document.body.className = styles.className

  for (let [ prop, value ] of Object.entries(styles)) {
    if (prop === 'className') continue

    document.body.style.setProperty(`--base0${prop}`, `#${value.toString(16).padStart(6, '0')}`)
    document.body.style.setProperty(`--base1${prop}`, `#${value.toString(16).padStart(6, '0')}60`)
    document.body.style.setProperty(`--base2${prop}`, `#${value.toString(16).padStart(6, '0')}30`)
  }
}

module.exports = Object.assign(theme, {apply})
