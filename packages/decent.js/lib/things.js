const fetch = require('./fetch')
const typeforce = require('typeforce')
const { EventEmitter, ArrayEmitter } = require('./emitter')

const SET_DATA = Symbol()
const SPEC = Symbol()

class Thing extends EventEmitter {
  constructor(client, spec, data) {
    super()
    Object.defineProperty(this, 'client', {value: client})

    Object.defineProperty(this, SPEC, {value: spec})

    Object.defineProperty(this, SET_DATA, {value: data => {
      try {
        typeforce(this[SPEC], data)
      } catch (err) {
        console.warn(`decent.js: Typecheck failed for ${this.constructor.name}:`, err.message)
      }

      for (const key of Object.keys(this[SPEC])) {
        this[key] = data[key]
      }
    }})

    Object.defineProperty(this, Symbol.iterator, {value: function* () {
      for (const key of Object.keys(this[SPEC])) {
        yield this[key]
      }
    }})

    this[SET_DATA](data)
  }
}

const OPTS = Symbol()

class Things extends ArrayEmitter {
  constructor(client, opts, startingValue = []) {
    super('set')
    Object.defineProperty(this, 'client', {value: client})
    Object.defineProperty(this, OPTS, {value: opts})
    this.set = startingValue
  }

  async load() {
    const { t, ts, T } = this[OPTS]
    let set

    try {
      set = await this.client.fetch(`/api/${ts}/`)
    } catch (err) {
      if (err.code === 'NOT_FOUND' || err.code === 'NO') {
        console.warn(`decent.js: Server does not support /api/${ts}`)
        set = {[ts]: []}
      } else {
        throw err
      }
    }

    this.set = set[ts].map(data => {
      // Re-use existing instances, if any
      return this.set.find(k => k.id === data.id)
        || new T(this.client, data)
    })

    this.emit('load', this.set)

    return this.set
  }
}

module.exports = { Thing, Things, SET_DATA }
