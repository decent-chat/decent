# const role = client.roles.nth(0)
Represents a single [role](role.md).

---

Properties:

* role.id
* role.name (string)
* role.permissions ([permissions object](https://github.com/decent-chat/spec/blob/master/doc.md#permissions))

---

Extends [eventemitter3](https://npm.im/eventemitter3).

## async setName(name: String)

## async setPermissions([permissions object](https://github.com/decent-chat/spec/blob/master/doc.md#permissions))

## async role.delete()
Deletes this role, provided you are logged-in and have the correct permissions to do so.

---

Use `role.on('event', callback)` method to listen for events.

## event 'delete' (emote: [emote](emote.md))
Emitted when this emote is deleted from the server.
