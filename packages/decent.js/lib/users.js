const fetch = require('./fetch')
const typeforce = require('typeforce')
const { Thing, Things, SET_DATA } = require('./things')
const { Message } = require('./channels')
const nextTick = k => setTimeout(k, 0)

const userType = {
  id: typeforce.oneOf('String', 'Number', 'Boolean'),
  username: 'String',

  avatarURL: 'String',
  flair: '?String',

  online: 'Boolean',
  roleIDs: typeforce.arrayOf('String'),

  email: '?String',
}

class User extends Thing {
  constructor(client, data) {
    super(client, userType, data)

    this.deleted = false

    this.client._socket.on('user/update', ({ user }) => {
      if (user.id === this.id) {
        this[SET_DATA](user)
        this.emit('update', this)
        this.emit('change')
      }
    })

    this.client._socket.on('user/delete', ({ userID }) => {
      if (userID === this.id) {
        // Oof
        this.deleted = true
        this.emit('delete', this)
        this.emit('change')
      }
    })

    this.client._socket.on('user/online', ({ userID }) => {
      if (userID === this.id) {
        this.online = true
        this.emit('online', this)
        this.emit('change')
      }
    })

    this.client._socket.on('user/offline', ({ userID }) => {
      if (userID === this.id) {
        this.online = false
        this.emit('offline', this)
        this.emit('change')
      }
    })
  }

  /*
  async getMentions() {
    return new UserMentions(this.client, this)
  }
  */

  async getPermissions() {
    const { permissions } = await this.client.fetch('/api/users/' + this.id + '/permissions')
    return permissions
  }

  toString() {
    return `<@${this.id}>`
  }
}

// TODO: figure out a good API for this as mentions are paginated.
class UserMentions extends Things {
  constructor(client, user) {
    super(client)
    Object.defineProperty(this, 'user', {value: user})
    this.set = user.mentions.map(msg => new Message(this.client, msg))

    this.client._socket.on('user/mentions/add', ({ message: messageObj }) => {
      // Mention events are always of the current user.
      if (this.user.id !== this.client.me.id) return

      const message = new Message(this.client, messageObj)

      this.set.push(message)
      this.emit('mention', message)
      this.emit('change')
    })

    this.client._socket.on('user/mentions/remove', ({ messageID }) => {
      if (this.user.id !== client.me.id) return

      const index = this.set.findIndex(msg => msg.id === messageID)

      if (index < 0) return // ???

      this.emit('unmention', msg)
      this.set.splice(index, 1)
      this.emit('change')
    })
  }

  on(...args) {
    if (!this.client.me || this.user.id !== this.client.me.id) console.warn(`decent.js: Mention events are not recieved for users other than the currently logged-in user, but you are listening for mentions of @${this.user.username}.`)

    return super.on(...args)
  }
}

class Users extends Things {
  constructor(client, set = []) {
    super(client, {t: 'user', ts: 'users', T: User})

    this.client._socket.on('user/new', ({ user: userObj }) => {
      const user = new User(this.client, userObj)

      // Add to this.set
      this.set.push(user)

      // Re-emit event
      this.emit('new', user)
      this.emit('change')
    })

    this.client._socket.on('user/delete', ({ userID }) => {
      const index = this.set.findIndex(usr => usr.id === userID)

      if (index < 0) return // ???

      // Re-emit event
      this.emit('delete', this.set[index])

      // Remove from set
      this.set.splice(index, 1)
      this.emit('change')
    })

    this.client._socket.on('user/update', ({ user }) => nextTick(() => {
      this.emit('update', user)
      this.emit('change')
    }))

    this.client._socket.on('user/online', ({ userID }) => nextTick(() => {
      this.emit('online', this.set.find(usr => usr.id === userID))
      this.emit('change')
    }))

    this.client._socket.on('user/offline', ({ userID }) => nextTick(() => {
      this.emit('offline', this.set.find(usr => usr.id === userID))
      this.emit('change')
    }))
  }
}

module.exports = { User, Users, userType }
