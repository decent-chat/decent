# decent.js documentation

decent.js exports a single class - [Client](client.md). See also:

* [client.channels](channels.md)
* [client.users](users.md)
* [client.emotes](emotes.md)

### error handling

decent.js methods return Errors with **custom `.name`** (not instanceof!) properties. These are:

* ClientOutdatedError (on login) - decent.js is outdated compared to the server
* ServerOutdatedError (on login) - The server is outdated compared to decent.js

* NotLoggedInError - You must be logged in to do that
* NoPermissionError - You must be logged in as an admin to perform that action

* DecentError - The server threw an error. See `error.code` and `error.message` for more info
* FetchError - A network error was encountered

### help!!

If you need help with something, ask a human at [+meta.decent.chat#decent-js-help](https://meta.decent.chat/servers/meta.decent.chat/channels/oB9rA6WqCzeLEJ80).

### examples

* Ping/pong

```js
const Client = require('decent.js')
const client = new Client()

client.connectTo('meta.decent.chat').then(async () => {
  await client.login('YOUR_USERNAME', 'YOUR_PASSWORD')

  client.channels.on('message', async message => {
    if (message.text === 'ping') {
      await message.channel.sendMessage('pong')
    }
  })
}).catch(console.error)
```

* Online/offline detector

```js
const Client = require('decent.js')
const client = new Client()

client.connectTo('meta.decent.chat').then(async () => {
  client.users.on('online', user => {
    console.log(`${user.username} came online.`)
  })

  client.users.on('offline', user => {
    console.log(`${user.username} went offline.`)
  })
}).catch(console.error)

* Listen for new emotes

```js
const Client = require('decent.js')
const client = new Client()

client.connectTo('meta.decent.chat').then(async () => {
  const main = client.channels.find(c => c.name === 'main')

  client.emotes.on('new', async emote => {
    await main.sendMessage(`New emote: ${emote}`)
  })
}).catch(console.error)
