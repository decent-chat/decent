import SessionActor from './SessionActor.js'
import ChannelsActor from './ChannelsActor.js'
import MessagesActor from './MessagesActor.js'

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
}

main()
  .catch(error => console.error(error))
