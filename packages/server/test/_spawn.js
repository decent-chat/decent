const decent = require('..')

module.exports = async port => {
  if (typeof port === 'undefined') {
    throw new Error('Port argument required')
  }
  return await decent(port, decent.DB_IN_MEMORY)
}
