const theme = {
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
    '--sidebar-border-color': 'var(--page-bg)',

    '--sidebar-list-item-fg': 'var(--gray-300)',
    '--sidebar-list-item-bg': 'transparent',

    '--sidebar-list-item-hoverfg': 'var(--gray-500)',
    '--sidebar-list-item-hoverbg': 'var(--gray-100)',

    '--sidebar-list-item-activefg': 'var(--gray-700)',
    '--sidebar-list-item-activebg': 'var(--gray-100)',

    '--sidebar-icon-color': 'var(--sidebar-list-item-fg)',
    '--sidebar-icon-color-active': 'var(--sidebar-list-item-activefg)',

    '--channel-header-bg': 'var(--page-bg)',
    '--channel-header-fg': 'var(--sidebar-fg)',
    '--channel-header-border-color': 'var(--sidebar-bg)',

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

    '--table-border-color': '#3c4144',

    '--table-header-bg': '#1c1e23',
    '--table-header-fg': 'var(--page-fg)',

    '--table-cell-bg': '#25292f',
    '--table-cell-fg': 'var(--page-dim-fg)',

    '--messageEditor-fg': 'var(--gray-700)',
    '--messageEditor-bg': '#25292f',
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

function apply(styles) {
  document.body.style = '' // Reset.

  for (let [ prop, value ] of Object.entries(styles)) {
    document.body.style.setProperty(prop, value)
  }
}

module.exports = Object.assign(theme, {apply})
