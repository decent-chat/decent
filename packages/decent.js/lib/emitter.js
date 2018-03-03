const typeforce = require('typeforce')
const EE = require('eventemitter3')

class EventEmitter extends EE {
  constructor() {
    super()

    Object.defineProperty(this, '_events', {enumerable: false})
    Object.defineProperty(this, '_eventsCount', {enumerable: false})
  }
}

const UNDERLYING_ARRAY = Symbol()

class ArrayEmitter extends EventEmitter {
  constructor(underlyingArrayKey) {
    super()

    Object.defineProperty(this, '_events', {enumerable: false})
    Object.defineProperty(this, '_eventsCount', {enumerable: false})
    Object.defineProperty(this, UNDERLYING_ARRAY, {value: underlyingArrayKey})
  }

  // We could use a Proxy to overload [k] here but I don't think it's worth it.
  nth(k) {
    return this[this[UNDERLYING_ARRAY]][k]
  }

  find(...args) {
    return this[this[UNDERLYING_ARRAY]].find(...args)
  }

  findIndex(...args) {
    return this[this[UNDERLYING_ARRAY]].findIndex(...args)
  }

  filter(...args) {
    return this[this[UNDERLYING_ARRAY]].filter(...args)
  }

  map(...args) {
    return this[this[UNDERLYING_ARRAY]].map(...args)
  }

  reduce(...args) {
    return this[this[UNDERLYING_ARRAY]].reduce(...args)
  }

  reduceRight(...args) {
    return this[this[UNDERLYING_ARRAY]].reduceRight(...args)
  }

  forEach(...args) {
    return this[this[UNDERLYING_ARRAY]].forEach(...args)
  }

  some(...args) {
    return this[this[UNDERLYING_ARRAY]].some(...args)
  }

  every(...args) {
    return this[this[UNDERLYING_ARRAY]].every(...args)
  }

  sort(...args) {
    return Array.from(this).sort(...args)
  }

  get length() {
    return this[this[UNDERLYING_ARRAY]].length
  }

  [Symbol.iterator]() {
    return this[this[UNDERLYING_ARRAY]][Symbol.iterator]()
  }
}

module.exports = { EventEmitter, ArrayEmitter }
