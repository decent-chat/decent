const fetch = require('./fetch')
const typeforce = require('typeforce')
const { Thing, Things, SET_DATA } = require('./things')
const nextTick = k => setTimeout(k, 0)

const roleType = {
  id: typeforce.oneOf('String', 'Number', 'Boolean'),
  name: 'String',
  permissions: 'Object',
}

class Role extends Thing {
  constructor(client, data) {
    super(client, roleType, data)

    this.deleted = false

    this.client._socket.on('role/update', ({ role }) => {
      if (role.id === this.id) {
        this[SET_DATA](role)
        this.emit('update', this)
      }
    })

    this.client._socket.on('role/delete', ({ roleID }) => {
      if (roleID === this.id) {
        this.deleted = true
        this.emit('delete', this)
      }
    })
  }

  async setPermissions(permissions) {
    await this.client.fetch('/api/roles/' + this.id, {method: 'PATCH'}, {
      permissions,
    })
  }

  async setName(name) {
    typeforce(name, 'String')

    await this.client.fetch('/api/roles/' + this.id, {method: 'PATCH'}, {
      name,
    })
  }

  async delete() {
    await this.client.fetch('/api/roles/' + this.id, {method: 'DELETE'})
    this.deleted = true
  }
}

class Roles extends Things {
  constructor(client, set = []) {
    super(client, {t: 'role', ts: 'roles', T: Role})

    this.client._socket.on('role/new', ({ role: roleObj }) => {
      const role = new Role(this.client, roleObj)

      // Add to this.set
      this.set.push(role)

      // Re-emit event
      this.emit('new', role)
      this.emit('change')
    })

    this.client._socket.on('role/delete', ({ roleID }) => {
      const index = this.set.findIndex(r => r.id === roleID)

      if (index < 0) return // ???

      // Re-emit event
      this.emit('delete', this.set[index])

      // Remove from set
      this.set.splice(index, 1)
      this.emit('change')
    })
  }

  async create(name, permissions) {
    typeforce('String', name)
    typeforce('Object', permissions)

    const { roleID: id } = await this.client.fetch('/api/emotes', {
      method: 'POST',
      body: {
        name, permissions,
      },
    })

    return new Role(this.client, {id, name, permissions})
  }

  async getOrder() {
    const { roleIDs } = await this.client.fetch('/api/roles/order')

    return roleIDs.map(roleID => this.find(role => role.id === roleID))
  }

  async setOrder(order) {
    typeforce(typeforce.arrayOf(Role))

    await this.client.fetch('/api/roles/order', {method: 'PATCH'}, {
      roleIDs: order.map(role => role.id),
    })
  }
}

module.exports = {Role, Roles, roleType}
