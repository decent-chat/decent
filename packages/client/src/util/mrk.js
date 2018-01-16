const mrk = require('mrk.js')

const withState = state => {
  Object.assign(mrk.patterns, {
    image ({ read, readUntil }, meta) {
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
    code ({ read, has }) {
      if (read() === '`') {
        if (read() === '`') return false

        // Eat up every character until another backtick
        let escaped = false
        let char

        while ((char = read())) {
          if (char === '\\' && !escaped) escaped = true
          else if (char === '`' && !escaped) return true
          else escaped = false
        }
      }
    },

    codeblock ({ read, readUntil, look }, meta) {
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

    channelref ({ read, readUntil, look }, meta) {
      let server = ''
      let c
      if (look() === '+') {
        read()

        while ((c = look())) {
          if (c === '#' || c === ' ' || c === '') break
          server += read()
        }
      }

      let channel = ''
      if (look() === '#') {
        read()

        while ((c = look())) {
          if (c === ' ' || c === '') break
          channel += read()
        }
      }

      if (!channel && !server) return false

      meta({ server, channel })

      return true
    },

    emote ({ read, has }) {
      if (read() === ':') {
        if (read() === ':') return false

        // Eat up every valid character until another colon
        let char

        while ((char = read())) {
          if (char === ':') return true
          else if (/[a-zA-Z0-9-_]/.test(char) === false) return false
        }
      }
    }
  })

  Object.assign(mrk.htmlify, {
    link: ({ metadata }) => `<a target='_blank' rel='noopener noreferrer' href='${mrk.escapeHTML(metadata.href).replace('javascript:', '')}'>
      ${mrk.escapeHTML(metadata.name)}
    </a>`,

    autolink: ({ text }) => `<a target='_blank' rel='noopener noreferrer' href='${mrk.escapeHTML(text)}'>
      ${mrk.escapeHTML(text)}
    </a>`,

    image ({ metadata }) {
      const src = mrk.escapeHTML(metadata.src)
      const alt = mrk.escapeHTML(metadata.alt)

      return `<a href='${src}' target='_blank' class='image'>
        <img src='${src}' alt='${alt}'s/>
      </a>`
    },

    codeblock ({ metadata }) {
      return `<pre><code class='codeblock language-${mrk.escapeHTML(metadata.lang).replace(/ /g, '-')}'>${mrk.escapeHTML(metadata.code)}</code></pre>`
    },

    channelref ({ metadata, text }) {
      return `<a class='channel-ref' data-server='${mrk.escapeHTML(metadata.server)}' data-channel='${mrk.escapeHTML(metadata.channel)}'>
        ${mrk.escapeHTML(text)}
      </a>`
    },

    emote ({ text }) {
      const emote = (state.emotes.list || []).find(e => e.shortcode === text.substr(1, text.length - 2))

      if (emote) {
        return `<img class='emote' src=${'//' + state.params.host + emote.imageURL} alt=${emote.shortcode}/>`
      } else {
        return mrk.escapeHTML(text)
      }
    }
  })

  return mrk
}

module.exports = withState
