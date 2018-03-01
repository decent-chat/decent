# @decent/server
Reference implementation of a [Decent](https://github.com/decent-chat/decent) server.

**You probably don't want to install this package directly!** If you're looking to host a [Decent](https://github.com/decent-chat/decent) chat server, you'll want [@decent/cli](https://github.com/decent-chat/decent/tree/master/packages/cli), which acts as an interface to both this package and [@decent/client](https://github.com/decent-chat/decent/tree/master/packages/client), the standard web client for Decent servers.

Otherwise, this module exports [an interface](#interface) to start, stop, and otherwise control the server.

### install
```sh
> npm install @decent/server
```

### example
```js
const decentServer = require('@decent/server')
const port = 3000

decentServer(port).then(function (server) {
  console.log('Decent server running on port ' + port)

  server.app.get('/', function (req, res) {
    res.text('Welcome to my cool Decent server!')
  })
}).catch(console.error)
```

### interface

#### `server = await decentServer(port = 3000, databaseDir = '/path/to/db/directory')`
(Note use of `await` here - `decentServer` returns a Promise.)

Spawns a Decent server. To use a volatile, in-memory datastore, pass `decentServer.DB_IN_MEMORY` as `databaseDir`.

#### `await server.kill()`
Kills the server. Returns a Promise.

**Below interface is unstable and will likely change between releases (ie. not following SemVer). Be careful.**

#### `server.app`
Running express server.

#### `server.wss`
Running [websocket server](https://github.com/websockets/ws/blob/HEAD/doc/ws.md).

### `server.sendToAllSockets(evt: String, data)`
Emits `{ evt, data }` to all connected sockets.

#### `server.httpServer`
Running http.server; essentially a combination of `server.app` and `server.wss`.

#### `server.db`
The following object. All values are [nedb-promise datastores](https://npm.im/nedb-promise).
```js
server.db = {
  messages,
  users,
  sessions,
  channels,
  settings,
}
```

### `server.settings`
See [settings.js](https://github.com/decent-chat/decent/tree/master/packages/server/settings.js).

### `server.serialize`
See [serialize.js](https://github.com/decent-chat/decent/tree/master/packages/server/serialize.js). Comes pre-made, so you can do `server.serialize.user({...})`.

### `server.util`
See [common.js](https://github.com/decent-chat/decent/tree/master/packages/server/common.js). Also comes pre-made.

### license
GPL-3.0
