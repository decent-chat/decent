const mrk = require('mrk.js')

const withState = state => {
  const mark = mrk({
    extendPatterns: {
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

      foreignReference({ read, readUntil, look }, meta) {
        let server = ''
        let c
        if (look() === '+') {
          read()

          while (c = look()) {
            if (/[a-z0-9\-.:]/i.test(c) === false) break
            server += read()
          }

          const hasPortNo = server.indexOf(':') !== -1
          const hasTLD = server.indexOf('.') !== -1
          const endsInBadChar = /[0-9\-.:]/.test(server[server.length - 1])

          if (!hasPortNo && !hasTLD) return false
          if (!hasPortNo && endsInBadChar) return false
        }

        let channel = ''
        if (look() === '#') {
          read()

          while (c = look()) {
            if (/[a-zA-Z0-9-_]/.test(c) === false) break
            channel += read()
          }
        }

        if (!channel && !server) return false

        meta({server, channel})

        return true
      },

      emote({ read, has }) {
        if(read() === ':') {
          if (read() === ':') return false

          // Eat up every valid character until another colon
          let escaped = false, char, n

          while (char = read()) {
            if (char === ':') return true
            else if (/[a-zA-Z0-9-_]/.test(char) === false) return false
          }
        }
      },

      mention({ read, readUntil }, meta) {
        if (read(2) !== '<@') return false

        const userID = readUntil('>')
        const user = state.userList.users.find(usr => usr.id === userID)

        if (!user) return false
        meta({user})

        return read(1) === '>'
      },
    },

    extendHtmlify: {
      link: ({ metadata }) => `<a class='Link' target='_blank' rel='noopener noreferrer' href='${mark.escapeHTML(metadata.href).replace('javascript:', '')}'>
        ${mark.escapeHTML(metadata.name)}
      </a>`,

      autolink: ({ text }) => `<a class='Link' target='_blank' rel='noopener noreferrer' href='${mark.escapeHTML(text)}'>
        ${mark.escapeHTML(text)}
      </a>`,

      image({ metadata }) {
        const src = mark.sanitizeURL(mark.escapeHTML(metadata.src))
        const alt = mark.escapeHTML(metadata.alt)

        return `<a href='${src}' target='_blank' class='Message-image'>
          <img src='${src}' alt='${alt}'s/>
        </a>`
      },

      codeblock({ metadata }) {
        return `<pre><code class='Message-codeblock'>${mark.escapeHTML(metadata.code)}</code></pre>`
      },

      foreignReference({ metadata, text }) {
        return `<a class='Message-foreignReference' data-server='${mark.escapeHTML(metadata.server)}' data-channel='${mark.escapeHTML(metadata.channel)}'>
          ${mark.escapeHTML(text)}
        </a>`
      },

      emote({ text }) {
        const emote = (state.emotes.list || []).find(e => e.shortcode === text.substr(1, text.length - 2))

        if (emote) {
          return `<img class='Message-emote' src=${'//' + state.params.host + emote.imageURL} title=':${emote.shortcode}:' alt=${emote.shortcode}/>`
        } else {
          return mark.escapeHTML(text)
        }
      },

      mention({ metadata: { user } }) {
        return `<a class='Message-mention${state.sessionAuthorized && user.id === state.session.user.id ? ' --of-you' : ''}'>
          @${mark.escapeHTML(user.username)}
        </a>`
      },
    }
  })

  return mark
}

module.exports = withState
