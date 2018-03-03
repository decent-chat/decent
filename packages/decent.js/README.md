# decent.js
A library for interacting with [Decent](https://github.com/decent-chat/decent) servers easily.

* Object-oriented
* Works in Node and your browser
* High level of abstraction

```js
const Decent = require('decent.js')
const client = new Decent()

client.connectTo('meta.decent.chat').then(async () => {
  await client.login('username', 'password')

  client.channels.on('message', async message => {
    if (message.text === 'ping') {
      await message.channel.sendMessage('pong')
    }
  })
}).catch(console.error)
```

### install
```sh
> npm install decent.js
```

decent.js runs in both Node and [the browser](https://wzrd.in/standalone/decent.js@latest).

### documentation
[Here.](docs/client.md)

### license
GPL-3.0
