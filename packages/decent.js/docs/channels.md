# const channels = client.channels
Represents all [channel](channel.md)s on the server. Updated automatically as events are recieved from the server.

---

Extends [eventemitter3](https://npm.im/eventemitter3) and [array-like](array-like.md) methods and properties.

## await channels.create(name: string)
Creates a new channel called `name`.

---

Use `channels.on('event', callback)` method to listen for events.

## event 'new' (channel: [Channel](channel.md))
Emitted when a new channel is created.

## event 'delete' (channel: [Channel](channel.md))
Emitted when a channel is deleted.

## event 'change'
Emitted when channel list state changes (ie. alongside the 'new' and 'delete' events, but not 'message').

## event 'message' (message: [Message](message.md))
Emitted when a message is sent to any channel.
