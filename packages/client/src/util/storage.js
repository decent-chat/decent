// thin wrapper around localStorage that auto-JSON-ifies values

const storage = {
  get (key) {
    try {
      return JSON.parse(localStorage.getItem(key))
    } catch (err) {
      return undefined
    }
  },

  set (key, value) {
    const valueJSON = JSON.stringify(value)

    localStorage.setItem(key, valueJSON)
  }
}

module.exports = storage
