const Client = require('..')
const client = new Client()

client.connectTo('meta.decent.chat').then(async () => {
  await client.login('username', 'password')

  client.channels.on('message', async message => {
    console.log(`${message.channel} @${message.author.username}: ${message.text}`)

    if (message.text === 'ping') {
      await message.channel.sendMessage('pong')
    }
  })
}).catch(console.error)
