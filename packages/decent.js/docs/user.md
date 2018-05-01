# const user = client.users.nth(0)
Represents a single registered user. Updated automatically.

---

Properties:

* user.id (string)
* user.username (string)

* user.avatarURL (string)
* user.flair (string)

* user.online (boolean)
* user.deleted (boolean)

* user.email (?string) - Only provided if `client.me == user` and it is set.

---

Extends [eventemitter3](https://npm.im/eventemitter3).

## user.toString()
Returns the identifying \@mention string for this user. For example:

```js
await channel.sendMessage(`Welcome, ${user}!`) // @mentions the user
```

Note that just sending `@username` will not work to actually mention a user.

## await user.getMentions()
Resolves with an instance of [UserMentions](user-mentions.md) for this user.

---

Use `user.on('event', callback)` method to listen for events.

## event 'update' (user: [User](user.md))
Emitted when this user's details (`email` or `flair`) are updated.

## event 'delete' (user: [User](user.md))
Emitted when this user is deleted.

## event 'online' (user: [User](user.md))
Emitted when this user comes online.

## event 'offline' (user: [User](user.md))
Emitted when this user goes offline.

## event 'change'
Emitted alongside every other event.
