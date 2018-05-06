const storage = /*window.sessionStorage ||*/ window.localStorage

function save(key, value) {
  if (value === undefined) storage.removeItem(key)
  else storage.setItem(key, JSON.stringify(value))

  console.log(`Storage: set ${key} =`, value)
}

function load(key, defaultValue) {
  const str = storage.getItem(key)
  const value = str ? JSON.parse(str) : defaultValue

  console.log(`Storage: loaded ${key} =`, value)
  return value
}

module.exports = { save, load }
