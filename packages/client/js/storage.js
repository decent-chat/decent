const storage = /*window.sessionStorage ||*/ window.localStorage

function save(key, value) {
  if (value === undefined) storage.removeItem(key)
  else storage.setItem(key, JSON.stringify(value))
}

function load(key, defaultValue) {
  const str = storage.getItem(key)
  const value = str ? JSON.parse(str) : defaultValue

  return value
}

module.exports = { save, load }
