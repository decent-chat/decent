const mrk = require('mrk.js')

Object.assign(mrk.patterns, {
  image({ read, readUntil }, meta) {
    if (read(2) !== '![') return

    // All characters up to `]` are the alt text
    const alt = readUntil(']')

    if (read(2) !== '](') return

    // All characters up to `)` are the image src
    const src = readUntil(')')

    // Set metadata
    meta({ alt, src })

    return read() === ')'
  },

  // mrk supports 'code' already - but we don't want it to apply
  // it if it's just '``' (i.e. no content)
  code({ read, has }) {
    if(read() === '`') {
      if (read() === '`') return false

      // Eat up every character until another backtick
      let escaped = false, char, n

      while (char = read()) {
        if (char === '\\' && !escaped) escaped = true
        else if (char === '`' && !escaped) return true
        else escaped = false
      }
    }
  },

  codeblock({ read, readUntil, look }, meta) {
    if (read(3) !== '```') return

    let numBackticks = 3
    while (look() === '`') {
      numBackticks++
      read()
    }

    // All characters up to newline following the intial
    // set of backticks represent the language of the code
    let lang = readUntil('\n')
    read()

    // Final fence
    let code = ''
    while (look(numBackticks) !== '`'.repeat(numBackticks)) {
      if (look().length === 0) return false // We've reached the end
      code += read()
    }

    read(numBackticks)
    if (look() !== '\n' && look() !== '') return false

    // Set metadata
    meta({ lang, code })

    return true
  },
})

Object.assign(mrk.htmlify, {
  image({ metadata }) {
    const src = mrk.escapeHTML(metadata.src)
    const alt = mrk.escapeHTML(metadata.alt)

    return `<a href='${src}' target='_blank' class='image'>
      <img src='${src}' alt='${alt}'s/>
    </a>`
  },

  codeblock({ metadata }) {
    return `<pre><code class='codeblock language-${mrk.escapeHTML(metadata.lang).replace(/ /g, '-')}'>${mrk.escapeHTML(metadata.code)}</code></pre>`
  },
})

module.exports = mrk
