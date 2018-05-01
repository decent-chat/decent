# const users = client.users
Represents all registered [user](user.md)s on the server. Updated automatically as events are recieved from the server.

---

Extends [eventemitter3](https://npm.im/eventemitter3) and [array-like](array-like.md) methods and properties.

---

Use `users.on('event', callback)` method to listen for events.

## event 'new' (user: [User](user.md))
Emitted when a user is registered.

## event 'update' (user: [User](user.md))
Emitted when a user's details are updated, namely `user.email` and `user.flair`.

## event 'online' (user: [User](user.md))
Emitted when a user comes online.

## event 'offline' (user: [User](user.md))
Emitted when a user goes offline.

## event 'delete' (user: [User](user.md))
Emitted when a user is deleted.

## event 'change'
Emitted alongside every other event, meaning this event is triggered whenever this set changes.
