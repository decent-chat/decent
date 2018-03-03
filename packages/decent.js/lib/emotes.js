const fetch = require('./fetch')
const typeforce = require('typeforce')
const { Thing, Things, SET_DATA } = require('./things')
const nextTick = k => setTimeout(k, 0)

const emoteType = {
  shortcode: 'String',
  imageURL: 'String',
}

class Emote extends Thing {
  constructor(client, data) {
    super(client, emoteType, data)

    this.deleted = false

    this.client._socket.on('emote/delete', ({ shortcode }) => {
      if (shortcode === this.shortcode) {
        this.deleted = true
        this.emit('delete', this)
      }
    })
  }

  async delete() {
    await this.client.fetch('/api/emotes/' + this.shortcode, {method: 'DELETE'})
    this.deleted = true
  }

  toString() {
    return `:${this.shortcode}:`
  }
}

class Emotes extends Things {
  constructor(client, set = []) {
    super(client, {t: 'emote', ts: 'emotes', T: Emote})

    this.client._socket.on('emote/new', ({ emote: emoteObj }) => {
      const emote = new Emote(this.client, emoteObj)

      // Add to this.set
      this.set.push(emote)

      // Re-emit event
      this.emit('new', emote)
      this.emit('change')
    })

    this.client._socket.on('emote/delete', ({ shortcode }) => {
      const index = this.set.findIndex(em => em.shortcode === shortcode)

      if (index < 0) return // ???

      // Re-emit event
      this.emit('delete', this.set[index])

      // Remove from set
      this.set.splice(index, 1)
      this.emit('change')
    })
  }

  async create(shortcode, imageURL) {
    typeforce('String', shortcode)
    typeforce('String', imageURL)

    await this.client.fetch('/api/emotes', {
      method: 'POST',
      body: {
        shortcode, imageURL,
      },
    })

    return new Emote(this.client, {shortcode, imageURL})
  }
}

module.exports = {Emote, Emotes, emoteType}
