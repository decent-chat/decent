# const roles = client.roles
Represents all [role](role.md)s on the server. Updated automatically as events are recieved from the server.

---

Extends [eventemitter3](https://npm.im/eventemitter3) and [array-like](array-like.md) methods and properties.

## async roles.create(name: string, permissions: [permissions object](https://github.com/decent-chat/spec/blob/master/doc.md#permissions))
Creates a new [role](role.md) and resolves with it.

```js
const mutedRole = await client.roles.create('Muted', {sendMessages: false})

console.log(mutedRole.id)
```

## async roles.getOrder()
Resolves with an array of [role](role.md)s. The 'order' of roles determines how they are prioritized. Note that the `_everyone`, `_guest`, and `_user` roles do not appear here.

## async roles.setOrder(roles: Array<[Role](role.md)>)
You can persist changes to the role order array produced by `getOrder()` to the server using this method.

---

Use `roles.on('event', callback)` method to listen for events.

## event 'new' (role: [role](role.md))
Emitted when a new role is created.

## event 'update' (role: [role](role.md))
Emitted when a role is update (name change, permission change).

## event 'delete' (role: [role](role.md))
Emitted when a role is deleted.

## event 'change'
Emitted when this set changes (ie. alongside all other events).
