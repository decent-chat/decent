const fetch = require('./fetch')
const typeforce = require('typeforce')
const { Thing, Things, SET_DATA } = require('./things')
const nextTick = k => setTimeout(k, 0)

const userType = {
  id: 'String',
  username: 'String',

  avatarURL: 'String',
  flair: '?String',

  online: 'Boolean',
  // permissions: permissionsType

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

  toString() {
    return `<@${this.id}>`
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
