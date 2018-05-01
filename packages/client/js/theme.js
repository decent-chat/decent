const theme = {
  light: {
    // Default - defined in the css/app.css
  },
  dark: {
    [0]: 0x222222,
    [1]: 0x202020,
    [2]: 0x303030,
    [3]: 0x505050,
    [4]: 0xb0b0b0,
    [5]: 0xd0d0d0,
    [6]: 0xe0e0e0,
    [7]: 0xe8e8e8,
    [8]: 0xffffff,
    [9]: 0xf29333,
    'A': 0xf8ca12,
    'B': 0x37b349,
    'C': 0xaabbbb,
    'D': 0x0e5a94,
    'E': 0x00aabb,
    'F': 0x7a2d00,
  },
}

function apply(styles) {
  document.body.style = '' // Reset.

  for (let [ prop, value ] of Object.entries(styles)) {
    document.body.style.setProperty(`--base0${prop}`, `#${value.toString(16).padStart(6, '0')}`)
    document.body.style.setProperty(`--base1${prop}`, `#${value.toString(16).padStart(6, '0')}60`)
    document.body.style.setProperty(`--base2${prop}`, `#${value.toString(16).padStart(6, '0')}30`)
  }
}

module.exports = Object.assign(theme, {apply})
