# const Client = require('decent.js')
Constructor takes no arguments:

```js
const Client = require('decent.js')
const client = new Client()
```

---

Extends [eventemitter3](https://npm.im/eventemitter3).

## await client.connectTo(hostname: string)
Attempts to connect to the Decent server at `hostname`. Returns a Promise that resolves once it has connected succesfully. Always call this before doing anything else.

Will reject if the server at `hostname` is unreachable or decent.js and it have different major version numbers (ie. incompatible).

## await client.register(username: string, password: string)
Creates a new users, resolving with the new [User](user.md). Fails if the username is taken, invalid, or the password is too short (typically < 6 characters is rejected).

## await client.login(username: string, password: string)
Attempts to log in using the provided credentials. Resolves with the newly logged-in [user](user.md).

## await client.loginWithSessionID(sessionID: string)
Attempts to log in using the provided sessionID. Resolves with the newly logged-in [user](user.md).

## await client.logout(deleteSessionID: boolean)
Logs out. `deleteSessionID` defaults to true, but you might want to set it to false if you're planning to use `client.loginWithSessionID` later.

## await client.getMessageByID(id: string)
Finds and resolves with the [message](message.md) with ID `id`.

## await client.setServerName(name: string)
Attempts to change the server's name (`client.serverName`).

## await client.uploadImage(file: Blob)
Resolves with the URL (string) of the uploaded file. The file must be a GIF, PNG, or JP(E)G.

---

## client.channels ([Channels](channels.md))
Represents all channels on the server, if any.

## client.users ([Users](users.md))
Represents all users registered on the server.

## client.me (?[User](user.md))
The currently logged-in user, or `null` if not logged in.

## client.serverVersion (string)

## client.serverName (string)

## client.connected (boolean)

---

Use `client.on('event', callback)` method to listen for events.

## event 'disconnect'
Emitted when the socket disconnects from the server due to an error.

## event 'reconnect'
Emitted when the socket reconnects after a disconnect.

## event 'namechange' (name: string)
Emitted when `client.serverName` changes.

## event 'login' (as: [User](user.md))
Emitted when the client logs in with `await client.login(...)` or `await client.loginWithSessionID(...)`.

## event 'logout'
Emitted when the client logs out with `await client.logout()`.
