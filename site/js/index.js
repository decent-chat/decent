import SessionActor from './SessionActor.js'
import ChannelsActor from './ChannelsActor.js'
import MessagesActor from './MessagesActor.js'

import { get as apiGet, post as apiPost } from './api.js'

const main = async function() {
  /*
  let processPGP = false
  let privateKey, publicKey, privateKeyObj
  let publicKeyDictionary = {}
  */

  // Everyone is an actor! Actors are essentially objects that
  // talk to eachother by posting messages to eachother. Kinda
  // like EventEmitters, but with a much snazzier name.
  // See https://en.wikipedia.org/wiki/Actor_model.
  const actors = {
    session:  new SessionActor,  // Handles login/register/session UI.
    channels: new ChannelsActor, // Controls the channel list sidebar.
    messages: new MessagesActor, // Handles sending/recieving messages.
  }

  // Establish a WebSocket connection. It's *almost* an
  // actor but not enough to live in the `actors` object.
  const socket = io()

  // Actors get references to other actors, plus a
  // reference to the WebSocket connection.
  for (let [ name, actor ] of Object.entries(actors)) {
    actor.name = name
    actor.actors = actors
    actor.socket = socket

    actor.init() // Actors should subscribe to events here.
  }

  // Let every actor begin to do stuff.
  for (let actor of Object.values(actors)) {
    actor.go() // Actors should load data here.
  }

  // Expose some stuff globally for debug purposes.
  window.actors = actors, window.get = apiGet, window.post = apiPost

  /*
  if ('privateKey' in localStorage && 'publicKey' in localStorage) {
    privateKey = localStorage.privateKey
    publicKey = localStorage.publicKey
    console.log('loaded key pair from local storage')
  }

  if ('sessionID' in localStorage) {
    state,sessionID = localStorage.sessionID
    console.log('loaded session ID from local storage')
  }
  
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
      key: publicKey, sessionID: state.sessionID
    })
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
  */
}

main()
  .catch(error => console.error(error))
