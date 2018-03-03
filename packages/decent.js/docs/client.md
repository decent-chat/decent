# const Client = require('decent.js')
Constructor takes no arguments:

```js
const Client = require('decent.js')
const client = new Client()
```

---

## await client.connectTo(hostname: string)
Attempts to connect to the Decent server at `hostname`. Returns a Promise that resolves once it has connected succesfully. Always call this before doing anything else.

Will reject if the server at `hostname` is unreachable or decent.js and it have different major version numbers (ie. incompatible).

## await client.login(username: string, password: string)
Attempts to log in using the provided credentials. Resolves with the newly logged-in [user](user.md).

## await client.loginWithSessionID(sessionID: string)
Attempts to log in using the provided sessionID. Resolves with the newly logged-in [user](user.md).

---

## client.channels ([Channels](channels.md))
Represents all channels on the server, if any.

## client.users ([Users](users.md))
Represents all users registered on the server.

## client.me (?[User](user.md))
The currently logged-in user, or `null` if not logged in.
