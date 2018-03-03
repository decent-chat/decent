# const mentions = await user.getMentions()
Represents a set of [message](message.md)s that represent `user`. **Only automatically updates and emits events if `user === client.me`.**

---

Extends [eventemitter3](https://npm.im/eventemitter3) and [array-like](array-like.md) methods and properties.

---

Use `mentions.on('event', callback)` method to listen for events. **No events will be emitted if `user !== client.me`.**

## event 'mention' (message: [Message](message.md))
Emitted when this user is mentioned in `message`.

## event 'unmention' (message: [Message](message.md))
Emitted when this user is unmentioned in `message` (ie. message was deleted/edited).

## event 'change'
Emitted alongside 'mention' and 'unmention' to show that state has changed.
