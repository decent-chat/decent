# const pins = await channel.getPins()
Represents a set of pinned [message](message.md)s in a particular channel. Updated automatically as events are recieved from the server.

---

Extends [eventemitter3](https://npm.im/eventemitter3) and [array-like](array-like.md) methods and properties.

---

Use `pins.on('event', callback)` method to listen for events.

## event 'pin' (message: [Message](message.md))
Emitted when a message is pinned.

## event 'delete' (message: [Message](message.md))
Emitted when a message is unpinned.
