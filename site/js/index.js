import SessionActor from './SessionActor.js'
import ChannelsActor from './ChannelsActor.js'
import MessagesActor from './MessagesActor.js'
import ModalsActor from './ModalsActor.js'

import Socket from './Socket.js'
import { get as apiGet, post as apiPost } from './api.js'

const main = async function() {
  // Everyone is an actor! Actors are essentially objects that
  // talk to eachother by posting messages to eachother. Kinda
  // like EventEmitters, but with a much snazzier name.
  // See https://en.wikipedia.org/wiki/Actor_model.
  const actors = {
    session:  new SessionActor,  // Handles login/register/session UI.
    channels: new ChannelsActor, // Controls the channel list sidebar.
    messages: new MessagesActor, // Handles sending/recieving messages.
    modals:   new ModalsActor,   // Creates and handles modal dialogs.
  }

  // Actors get references to other actors.
  for (const [ name, actor ] of Object.entries(actors)) {
    actor.name = name
    actor.actors = actors

    actor.init() // Actors should subscribe to events from each-other here.
  }

  let socket = null
  actors.session.on('switch server', hostname => {
    const url = 'ws://' + hostname // wss:// soon (tm)? see api.js
    if (socket) {
      socket.url = url
      socket.reconnect()
    } else {
      socket = new Socket(url)

      // Allow actors to subscribe to messages from the socket.
      for (const actor of Object.values(actors)) {
        actor.bindToSocket(socket)
      }
    }

    if ('serviceWorker' in navigator && actors.session.sessionID) {
      Promise.all([ navigator.serviceWorker.ready, Notification.requestPermission() ]).then(async ([ reg, permission ]) => {
        if (permission !== 'granted') {
          throw 'denied notification permission'
        }

        // If the server sends a POST request to `pushSub.endpoint`, a
        // 'push' event will be triggered on the ServiceWorker. This
        // is awesome!!
        const pushSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
        })

        await apiPost('add-push-subscriber', {
          subscription: pushSub, // serializes
          sessionID: actors.session.sessionID,
        }, hostname)
      })
    }
  })

  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js')
      .catch(console.error)
  }

  await actors.session.initialLoad()

  // Let every actor begin to do stuff.
  for (const actor of Object.values(actors)) {
    actor.go() // Actors should load data here.
  }

  // Expose some stuff globally for debug purposes.
  window.actors = actors, window.get = apiGet, window.post = apiPost
}

main()
  .catch(error => console.error(error))
