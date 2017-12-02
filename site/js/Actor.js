// See https://en.wikipedia.org/wiki/Actor_model.
// Like an EventEmitter but cooler.

// TODO
export default class Actor {
  constructor() {
    this.listeners = {}
  }

  // Subscribes to a message from an actor.
  on() {}

  // Same as Actor#on(), but only once.
  once(message) {}

  publish(message, data) {

  }
}
