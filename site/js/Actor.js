// See https://en.wikipedia.org/wiki/Actor_model, ish.
// Like an EventEmitter but cooler.

export default class Actor {
  constructor() {
    this.__subscribers = []
  }

  init() {} // Subscribe to events here.
  go() {}   // Perform initial actions here.

  // Subscribes to a message type from this actor.
  on(message, callback, times = Infinity) {
    let subs = this.__subscribers[message] || []
    subs.push({ callback, times })

    this.__subscribers[message] = subs
  }

  // Waits for `message` and then resolves the promise.
  waitFor(message) {
    return new Promise(resolve => {
      this.on(message, resolve, 1)
    })
  }

  // Emits a message and notifies all subscribers.
  // Other actors should not call this.
  emit(message, ...data) {
    let subs = (this.__subscribers[message] || [])

    console.info(this.name + '::', message, ...data)

    for (let sub of subs) {
      sub.callback(...data)
      sub.times--
    }

    this.__subscribers[message] = subs.filter(sub => sub.times > 0)
  }
}
