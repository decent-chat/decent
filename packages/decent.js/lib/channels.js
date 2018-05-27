const fetch = require('./fetch')
const typeforce = require('typeforce')
const { Thing, Things, SET_DATA } = require('./things')

const nextTick = k => setTimeout(k, 0)

const queryString = query => {
  const esc = encodeURIComponent
  return Object.keys(query).length > 0
    ? '?' + Object.keys(query)
      .map(k => esc(k) + '=' + esc(query[k]))
      .join('&')
    : ''
}

const channelType = {
  id: typeforce.oneOf('String', 'Number', 'Boolean'),
  name: 'String',

  unreadMessageCount: '?Number',
  oldestUnreadMessageID: '?String',
}

const messageType = {
  id: typeforce.oneOf('String', 'Number', 'Boolean'),
  channelID: 'String',

  type: 'String', // "user" or "system"
  text: 'String',

  authorID: '?String',
  authorUsername: '?String',
  authorAvatarURL: '?String',

  dateCreated: typeforce.oneOf('Number', 'Date'),
  dateEdited: typeforce.oneOf('?Number', 'Date'),
}

class Message extends Thing {
  fixDates() {
    this.dateCreated = new Date(this.dateCreated * 1000)
    this.dateEdited = this.dateEdited ? new Date(this.dateEdited * 1000) : null
  }

  constructor(client, data) {
    super(client, messageType, data)

    this.fixDates()
    this.deleted = false

    this.channel = this.client.channels.find(channel => channel.id === data.channelID)
    this.author = this.client.users.find(user => user.id === data.authorID)

    this.client._socket.on('message/edit', ({ message }) => {
      if (message.id === this.id) {
        this[SET_DATA](message)
        this.fixDates()

        this.emit('edit', this)
        this.emit('change')
      }
    })

    this.client._socket.on('message/delete', ({ messageID }) => {
      if (messageID === this.id) {
        // Oof
        this.deleted = true
        this.emit('delete', this)
        this.emit('change')
      }
    })

    this.client._socket.on('channel/pins/add', ({ message: messageObj }) => {
      if (messageObj.id === this.id) {
        this.emit('pin', this)
        this.emit('change')
      }
    })

    this.client._socket.on('channel/pins/remove', ({ messageID }) => {
      if (messageID == this.id) {
        this.emit('unpin', this)
        this.emit('change')
      }
    })
  }

  async pin() {
    await this.client.fetch('/api/channels/' + this.channel.id + '/pins', {
      method: 'POST',
      body: {messageID: this.id},
    })
  }

  async unpin() {
    await this.client.fetch('/api/channels/' + this.channel.id + '/pins/' + this.id, {
      method: 'DELETE',
    })
  }

  async edit(text) {
    typeforce('String', text)

    if (text.length === 0) return this.delete()

    await this.client.fetch('/api/messages/' + this.id, {
      method: 'PATCH',
      body: {text}
    })
  }

  async delete() {
    await this.client.fetch('/api/messages/' + this.id, {
      method: 'DELETE',
    })
  }
}

class PinnedMessages extends Things {
  constructor(client, channel) {
    super(client)
    Object.defineProperty(this, 'channel', {value: channel})

    this.client._socket.on('channel/pins/add', ({ message: messageObj }) => {
      if (messageObj.channelID === this.channel.id) {
        const message = new Message(this.client, messageObj)

        this.set.push(message)
        this.emit('pin', message)
        this.emit('change')
      }
    })

    this.client._socket.on('channel/pins/remove', ({ messageID }) => {
      const index = this.set.findIndex(msg => msg.id === messageID)

      if (index < 0) return // Not this channel's pin

      this.emit('unpin', this.set[index])
      this.set.splice(index, 1)
      this.emit('change')
    })
  }

  async load() {
    const { pins } = await this.client.fetch('/api/channels/' + this.channel.id + '/pins')

    return this.set = pins.map(pin => new Message(this.client, pin))
  }
}

class Channel extends Thing {
  constructor(client, data) {
    super(client, channelType, data)

    this.deleted = false

    this.client._socket.on('channel/update', ({ channel }) => {
      if (channel.id === this.id) {
        this[SET_DATA](channel)
        this.emit('update', this)
        this.emit('change')
      }
    })

    this.client._socket.on('channel/delete', ({ channelID }) => {
      if (channelID === this.id) {
        // Oof
        this.deleted = true
        this.emit('delete', this)
        this.emit('change')
      }
    })

    this.client._socket.on('message/new', ({ message: messageObj }) => {
      if (messageObj.channelID === this.id) {
        this.emit('message', new Message(this.client, messageObj))
      }
    })
  }

  async refresh() {
    const { channel } = await this.client.fetch('/api/channels/' + this.id)

    this[SET_DATA](channel)
  }

  async markRead() {
    await this.client.fetch('/api/channels/' + this.id + '/mark-read', {
      method: 'POST',
    })

    await this.refresh()

    this.emit('change')

    this.client.channels.emit('update', this)
    this.client.channels.emit('change')
  }

  async getMessages({ before, after, limit } = {}) {
    typeforce(typeforce.maybe(messageType), before)
    typeforce(typeforce.maybe(messageType), after)
    typeforce('?Number', limit)

    if (typeof limit !== 'undefined') {
      if (Math.floor(limit) !== limit)
        throw new TypeError('getMessages({ limit }) must be int')
      if (limit < 1 || limit > 50)
        throw new TypeError('getMessages({ limit }) does not satisfy 1 <= limit <= 50')
    }

    const qs = {}
    if (before) qs.before = before.id
    if (after) qs.after = after.id
    if (limit) qs.limit = limit

    const { messages } = await this.client.fetch('/api/channels/' + this.id + '/messages' + queryString(qs))

    return messages.map(msg => new Message(this.client, msg))
  }

  async getPins() {
    const pins = new PinnedMessages(this.client, this)

    await pins.load()

    return pins
  }

  async sendMessage(text, type = 'text') {
    typeforce('String', text)

    const { messageID } = await this.client.fetch('/api/messages', {
      method: 'POST',
      body: {
        channelID: this.id,
        text, type,
      },
    })

    return messageID
  }

  async rename(name) {
    typeforce('String', name)

    await this.client.fetch('/api/channels/' + this.id, {method: 'PATCH', body: {name}})
    this.name = name
  }

  async delete() {
    await this.client.fetch('/api/channels/' + this.id, {method: 'DELETE'})
    this.deleted = true
  }

  toString() {
    return '#' + this.name
  }
}

class Channels extends Things {
  constructor(client) {
    super(client, {t: 'channel', ts: 'channels', T: Channel})

    this.client._socket.on('channel/new', ({ channel: channelObj }) => {
      const channel = new Channel(this.client, channelObj)

      // Add to this.set
      this.set.push(channel)

      // Re-emit event
      this.emit('new', channel)
      this.emit('change')
    })

    this.client._socket.on('channel/delete', ({ channelID }) => {
      const index = this.set.findIndex(chl => chl.id === channelID)

      if (index < 0) return // ???

      // Re-emit event
      this.emit('delete', this.set[index])

      // Remove from set
      this.set.splice(index, 1)
      this.emit('change')
    })

    this.client._socket.on('channel/update', ({ channel }) => nextTick(() => {
      this.emit('update', channel)
      this.emit('change')
    }))

    this.client._socket.on('message/new', async ({ message: messageObj }) => {
      this.emit('message', new Message(this.client, messageObj))

      for (const channel of this.set) {
        if (channel.id === messageObj.channelID) {
          const unread = channel.unreadMessageCount

          await channel.refresh()

          if (unread != channel.unreadMessageCount) {
            this.emit('update', channel)
            channel.emit('update', channel)
            channel.emit('change')
          }
        }
      }

      this.emit('change')
    })

    // pin-related events are found under Message(s)
  }

  async create(name) {
    typeforce('String', name)

    const { channelID } = await this.client.fetch('/api/channels', {
      method: 'POST',
      body: {name},
    })

    return this.set.find(c => c.id === channelID) || new Promise(resolve => {
      this.on('new', channel => {
        if (channel.id === channelID) {
          resolve(channel)
        }
      })
    })
  }
}

module.exports = {
  Channel, Channels, channelType,
  PinnedMessages, Message, messageType,
}
