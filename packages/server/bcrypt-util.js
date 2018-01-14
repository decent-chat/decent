const bcrypt = require('bcrypt-nodejs')

module.exports.genSalt = (rounds = 10) => new Promise((resolve, reject) => {
  bcrypt.genSalt(rounds, (err, salt) => {
    if (err) {
      reject(err)
    } else {
      resolve(salt)
    }
  })
})

module.exports.hash = (str, salt) => new Promise((resolve, reject) => {
  bcrypt.hash(str, salt, null, (err, hash) => {
    if (err) {
      reject(err)
    } else {
      resolve(hash)
    }
  })
})

module.exports.compare = (data, encrypted) => new Promise((resolve, reject) => {
  bcrypt.compare(data, encrypted, (err, result) => {
    if (err) {
      reject(err)
    } else {
      resolve(result)
    }
  })
})

