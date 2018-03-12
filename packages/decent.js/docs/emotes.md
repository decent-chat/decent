# const emotes = client.emotes
Represents all [emote](emote.md)s on the server. Updated automatically as events are recieved from the server.

---

Extends [eventemitter3](https://npm.im/eventemitter3) and [array-like](array-like.md) methods and properties.

## async emotes.create(shortcode: string, imageURL: string)
Creates a new [emote](emote.md) and resolves with it. Note that `shortcode` should **not** contain the outer colons. You can combine this method with `client.uploadImage`:

```js
const emote = await client.emotes.create('package', await client.uploadImage('/path/to/package.png'))

console.log(emote.imageURL)
```

---

Use `emotes.on('event', callback)` method to listen for events.

## event 'new' (emote: [emote](emote.md))
Emitted when a new emote is created.

## event 'delete' (emote: [emote](emote.md))
Emitted when a emote is deleted.

## event 'change'
Emitted when this set changes (ie. alongside the 'new' and 'delete' events).
