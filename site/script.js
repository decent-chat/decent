const apiPost = function(path, dataObj) {
  return fetch(path, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dataObj)
  }).then(res => res.json())
}

const queryByDataset = function(key, value) {
  return `[data-${key}='${value.replace(/'/g, '\\\'')}']`
}

const main = async function() {
  const socket = io()

  let sessionID, sessionObj
  let processPGP = false
  let privateKey, publicKey, privateKeyObj
  let publicKeyDictionary = {}

  if ('privateKey' in localStorage && 'publicKey' in localStorage) {
    privateKey = localStorage.privateKey
    publicKey = localStorage.publicKey
    console.log('loaded key pair from local storage')
  }

  if ('sessionID' in localStorage) {
    sessionID = localStorage.sessionID
    console.log('loaded session ID from local storage')
  }

  const loginStatusEl = document.getElementById('login-status')
  const updateSessionData = async function() {
    let loggedIn = false

    if (sessionID) {
      const sessionData = await fetch('/api/session/' + sessionID).then(res => res.json())

      if (sessionData.success) {
        loggedIn = true
        sessionObj = sessionData
      }
    }

    for (const msg of document.querySelectorAll('.message.created-by-us')) {
      msg.classList.remove('created-by-us')
    }

    while (loginStatusEl.firstChild) loginStatusEl.firstChild.remove()

    if (loggedIn) {
      const { user: { username, _id: userID } } = sessionObj

      loginStatusEl.appendChild(document.createTextNode(
        'Logged in as ' + username
      ))

      document.getElementById('register').style.display = 'none'
      document.getElementById('login').style.display = 'none'
      document.getElementById('logout').style.removeProperty('display')

      for (const msg of document.querySelectorAll(queryByDataset('author', userID))) {
        msg.classList.add('created-by-us')
      }
    } else {
      loginStatusEl.appendChild(document.createTextNode('Not logged in'))

      document.getElementById('register').style.removeProperty('display')
      document.getElementById('login').style.removeProperty('display')
      document.getElementById('logout').style.display = 'none'
    }
  }

  await updateSessionData()

  document.getElementById('gen-key').addEventListener('click', async () => {
    const name = prompt('What name would you like to assign to your key?')

    if (name === null) {
      return
    }

    const email = prompt('What email address would you like to assign to your key?')

    if (email === null) {
      return
    }

    const passphrase = prompt('What passphrase would you like to use with your key?')

    if (passphrase === null) {
      return
    }

    if (!(name && email && passphrase)) {
      alert('Please specify a name, email address, and passphrase.')
      return
    }

    console.log('generating key..')

    const key = await openpgp.generateKey({
      numBits: 4096,
      passphrase,
      userIds: [
        {name, email}
      ]
    })

    publicKey = key.publicKeyArmored
    privateKey = key.privateKeyArmored

    console.log('generated key')
  })

  document.getElementById('load-key').addEventListener('click', () => {
    if (!(privateKey && publicKey)) {
      console.error('cannot load key - none is available')
      return
    }

    const passphrase = prompt('What is the key\'s passphrase?')

    privateKeyObj = openpgp.key.readArmored(privateKey).keys[0]
    privateKeyObj.decrypt(passphrase)

    console.log('loaded private key')
  })

  document.getElementById('save-key').addEventListener('click', () => {
    if (!(privateKey && publicKey)) {
      console.error('cannot save key - none is available')
      return
    }

    localStorage.publicKey = publicKey
    localStorage.privateKey = privateKey
  })

  document.getElementById('publish-key').addEventListener('click', async () => {
    if (!(privateKey && publicKey)) {
      console.error('cannot publish key - none is available')
      return
    }

    await apiPost('/api/release-public-key', {
      key: publicKey, sessionID
    })
  })

  document.getElementById('register').addEventListener('click', async () => {
    const username = prompt('Username?')

    if (username === null) {
      return
    }

    const password = prompt(
      'Password? (Must be at least 6 characters long.)\n' +
      'This password is NOT secure yet! It is stored securely, but you are probably not on an HTTPS connection.\n' +
      'That means just about anyone can look at your HTTP request and find out your password.\n' +
      'DO NOT use something you use anywhere else!'
    )

    if (password === null) {
      return
    }

    if (!username || !password) {
      alert('Please enter both a username and a password.')
      return
    }

    const result = await apiPost('/api/register', {username, password})

    if (result.error) {
      if (result.error === 'password must be at least 6 characters long') {
        alert('Couldn\'t create account - password too short.')
      } else if (result.error === 'username already taken') {
        alert('Couldn\'t create account - username already taken.')
      } else if (result.error === 'username invalid') {
        alert('Couldn\'t create account - username is invalid (only alphanumeric, underscores, and dashes allowed)')
      }
      return
    }

    alert(`Success! Account ${username} created. Please log in.`)
  })

  document.getElementById('login').addEventListener('click', async () => {
    const username = prompt('Username?')

    if (username === null) {
      return
    }

    const password = prompt('Password?')

    if (password === null) {
      return
    }

    if (!username || !password ) {
      alert('Please enter both a username and a password.')
    }

    const result = await apiPost('/api/login', {username, password})

    if (result.error) {
      if (result.error === 'user not found') {
        alert(`There is no user with the username ${username}.`)
      } else if (result.error === 'incorrect password') {
        alert(`Incorrect password!`)
      }
      return
    }

    sessionID = result.sessionID
    localStorage.sessionID = sessionID

    await updateSessionData()
  })

  document.getElementById('logout').addEventListener('click', async () => {
    sessionID = ''
    localStorage.sessionID = ''
    await updateSessionData()
  })

  const signText = async function(text) {
    if (publicKey && privateKeyObj) {
      const cleartext = await openpgp.sign({
        data: text,
        privateKeys: privateKeyObj
      })

      return cleartext.data
    }
  }

  const chatInput = document.getElementById('chat-input')
  const form = document.getElementById('form')
  form.addEventListener('submit', async evt => {
    evt.preventDefault()

    const text = chatInput.value
    chatInput.value = ''

    if (text.trim().length === 0) {
      return
    }

    const signature = await signText(text)

    await apiPost('/api/send-message', {
      text,
      signature,
      sessionID
    })
  })

  const formatMessageText = function(text) {
    // Formats some message text and returns a <span> element ready to be displayed.

    const el = document.createElement('span')
    const { user } = sessionObj

    let buffer = ''
    let currentToken = 'text'
    let styles = {} // (b)old, (i)talics, (u)nderline, (s)trikethrough
    let esc = false

    function startToken(nextToken) {
      // end the current token
      if (buffer === '') {
        ;
      } else if (currentToken === 'text') {
        const textNode = document.createTextNode(buffer)
        const spanEl = document.createElement('span')
        spanEl.appendChild(textNode)

        // (b)old, (i)talic, etc.
        for (let [ style, enabled ] of Object.entries(styles)) {
          if (style == 'i_') style = 'i'
          if (enabled) spanEl.classList.add('message-format-' + style)
        }

        el.appendChild(spanEl)
      } else if (currentToken === 'mention') {
        if (buffer === '@') { // TODO: must be a logged-in username!
          // not a mention; treat as text
          el.appendChild(document.createTextNode(buffer))
        } else {
          const mentionEl = document.createElement('span')

          mentionEl.classList.add('message-mention')

          if (buffer === '@' + user.username || buffer === '@everyone')
            mentionEl.classList.add('message-mention-of-user')

          mentionEl.appendChild(document.createTextNode(buffer))
          el.appendChild(mentionEl)
        }
      } else if (currentToken === 'code') {
        const codeEl = document.createElement('code')

        codeEl.classList.add('message-inline-code')
        codeEl.appendChild(document.createTextNode(buffer))

        el.appendChild(codeEl)
      } else if (currentToken === 'latex') {
        const spanEl = document.createElement('span')

        spanEl.classList.add('message-latex')
        katex.render(buffer, spanEl)

        el.appendChild(spanEl)
      }

      // start next token
      buffer = ''
      currentToken = nextToken
    }

    function toggleStyle(k) {
      if (styles[k] === true) {
        // end style
        startToken('text')
        styles[k] = false
      } else {
        // start style
        startToken('text') // end current token
        styles[k] = true
      }
    }

    for (let c = 0; c < text.length; c++) {
      const char = text[c]
      const charBefore = text[c - 1] || ' '
      const charNext = text[c + 1] || ' '

      if (esc) esc = false
      else {
        if (char === '\\') { esc = true; continue }

        else if (char === '@' && currentToken === 'text' && charBefore === ' ') startToken('mention')
        else if (!(/[a-zA-Z0-9_-]/).test(char) && currentToken === 'mention') startToken('text')

        else if (char === '*' && currentToken === 'text') {
          if (charNext === '*') {
            // bold
            toggleStyle('b')
            c++ // skip charNext
          } else {
            // italic
            toggleStyle('i')
          }

          continue
        }

        else if (char === '_' && currentToken === 'text') {
          if (charNext === '_') {
            // underline
            toggleStyle('u')
            c++ // skip charNext
          } else {
            // italic
            toggleStyle('i_')
          }

          continue
        }

        else if (char === '~' && charNext === '~' && currentToken === 'text') {
          // strikethrough
          toggleStyle('s')
          c++ // skip charNext

          continue
        }

        else if (char === '$' && charNext === '$' && currentToken !== 'latex') { startToken('latex'); c++; continue }
        else if (char === '$' && charNext === '$' && currentToken === 'latex') { startToken('text'); c++; continue }

        else if (char === '`' && currentToken !== 'code') { startToken('code'); continue }
        else if (char === '`' && currentToken === 'code') { startToken('text'); continue }
      }

      buffer += char
    }

    styles = {}
    startToken(null)
    return el
  }

  const buildMessageContent = async function(message, revisionIndex = null) {
    // Builds the message content elements of a message. If the passed revision index
    // is set to null, or is greater than the number of revisions, the most recent
    // revision is used.

    const { authorUsername } = message

    if (!(revisionIndex in message.revisions)) {
      revisionIndex = message.revisions.length - 1
    }

    if (revisionIndex < 0) {
      revisionIndex = 0
    }

    const revision = message.revisions[revisionIndex]

    const { text, signature } = revision

    const el = document.createElement('div')
    el.classList.add('message-revision-content')

    const authorEl = document.createElement('div')
    authorEl.classList.add('message-author')
    authorEl.appendChild(document.createTextNode(authorUsername))

    el.appendChild(authorEl)

    const messageDate = new Date(message.date)

    const time = document.createElement('time')
    time.setAttribute('datetime', messageDate.toISOString())
    time.appendChild(document.createTextNode(`${messageDate.getHours()}:${messageDate.getMinutes()}`))
    el.appendChild(time)

    const contentEl = formatMessageText(text)
    contentEl.classList.add('message-content')
    el.appendChild(contentEl)

    if (processPGP) {
      // TODO: Re-write this code to work with user IDs rather than usernames.
      if (signature) {
        if (authorUsername in publicKeyDictionary === false) {
          el.appendChild(document.createTextNode(' (Signed, but this user is not in your public key dictionary)'))
        } else {
          const verified = await openpgp.verify({
            message: openpgp.cleartext.readArmored(signature),
            publicKeys: openpgp.key.readArmored(publicKeyDictionary[authorUsername]).keys
          })

          if (verified.signatures[0].valid) {
            el.appendChild(document.createTextNode(' (Verified)'))
          } else {
            el.appendChild(document.createTextNode(' (FORGED? Signature data provided, but sign did not match)'))
          }
        }
      } else {
        el.appendChild(document.createTextNode(' (No signature data)'))
      }
    }

    if (message.revisions.length > 1) {
      let label
      if (message.revisions.length === 2) {
        label = '(Edited)'
      } else {
        label = `(Edited ${message.revisions.length - 1} times)`
      }

      const a = document.createElement('a')
      a.href = '#'
      a.appendChild(document.createTextNode(label))

      el.appendChild(document.createTextNode(' '))
      el.appendChild(a)

      a.addEventListener('click', async evt => {
        evt.preventDefault()
        evt.stopPropagation()

        const index = prompt('View the version at what index? (Leave blank for the latest.)')

        if (index === null) {
          return
        }

        if (index.trim().length) {
          await showMessageRevision(message, index - 1)
        } else {
          await showMessageRevision(message)
        }
      })
    }

    return el
  }

  const messagesContainer = document.getElementById('messages')

  socket.on('received chat message', async msg => {
    if (typeof msg !== 'object') {
      return
    }

    const { revisions, authorID, _id } = msg.message

    if (!revisions || !authorID) {
      return
    }

    if (!revisions.length || !revisions[0].text) {
      return
    }

    const getScrollDist = () => messages.scrollHeight - messages.offsetHeight
    let wasScrolledToBottom = (messages.scrollTop === getScrollDist())

    const el = document.createElement('div')
    el.classList.add('message')
    el.setAttribute('id', 'message-' + _id)
    el.dataset.author = authorID
    el.appendChild(await buildMessageContent(msg.message))
    messagesContainer.appendChild(el)

    if (sessionObj && authorID === sessionObj.user._id) {
      el.classList.add('created-by-us')
    }

    if (wasScrolledToBottom) {
      messagesContainer.scrollTop = getScrollDist()
    }

    el.addEventListener('click', async () => {
      // Don't do anything if we don't own this message!
      if (!(sessionObj && authorID === sessionObj.user._id)) {
        return
      }

      const text = prompt('Edit message - new content?')

      if (!text || text.trim().length === 0) {
        return
      }

      const result = await apiPost('/api/edit-message', {
        sessionID, text,
        messageID: _id,
        signature: await signText(text)
      })
    })
  })

  const showMessageRevision = async function(message, index = undefined) {
    const el = document.getElementById('message-' + message._id)

    if (el) {
      const content = el.querySelector('.message-revision-content')
      if (content) {
        content.remove()
      }
      el.appendChild(await buildMessageContent(message, index))
    }
  }

  socket.on('edited chat message', async msg => {
    if (typeof msg !== 'object') {
      return
    }

    await showMessageRevision(msg.message)
  })

  socket.on('released public key', async msg => {
    if (typeof msg !== 'object') {
      return
    }

    const { key, username } = msg

    if (!key || !username) {
      return false
    }

    const el = document.createElement('div')
    el.appendChild(document.createTextNode(msg.username))
    el.appendChild(document.createTextNode(' has released a public key!'))

    const pre = document.createElement('pre')
    pre.appendChild(document.createTextNode(msg.key))
    el.appendChild(pre)

    const accept = document.createElement('button')
    accept.appendChild(document.createTextNode('Accept'))
    el.appendChild(accept)

    const ignore = document.createElement('button')
    ignore.appendChild(document.createTextNode('Ignore'))
    el.appendChild(ignore)

    messagesContainer.appendChild(el)

    accept.addEventListener('click', () => {
      el.remove()

      // TODO: __proto__, prototype, bad stuff
      publicKeyDictionary[msg.userID] = msg.key
    })

    ignore.addEventListener('click', () => {
      el.remove()
    })
  })
}

main()
  .catch(error => console.error(error))
