const EventEmitter = require('eventemitter3')

// A little observable value
class Atom extends EventEmitter {
  constructor(value) {
    super()
    this.value = value
  }

  set(value) {
    this.emit('change', this.value = value)
  }

  get() {
    return this.value
  }
}

module.exports = Atom
