const getPort = require('util').promisify(require('openport').find)
const decent = require('..')

module.exports = async () => {
  const port = await getPort()
  const server = await decent(port, decent.DB_IN_MEMORY)

  return { server, port }
}
