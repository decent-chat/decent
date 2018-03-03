# const emote = client.emotes.nth(0)
Represents a single [emote](emote.md).

---

Extends [eventemitter3](https://npm.im/eventemitter3).

## async emote.delete()
Deletes this emote, assuming you are logged-in and have the correct permissions.

---

Use `emote.on('event', callback)` method to listen for events.

## event 'delete' (emote: [emote](emote.md))
Emitted when this emote is deleted from the server.
