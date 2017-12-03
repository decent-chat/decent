export default function bindKeys(keysRequired, callbackFn) {
  let keysDownCount = 0

  document.addEventListener('keydown', evt => {
    if (keysRequired[keysDownCount] === evt.keyCode) {
      keysDownCount++
      evt.preventDefault()

      if (keysDownCount === keysRequired.length) {
        callbackFn()
        keysDownCount--
      }

      return false
    }
  })

  document.addEventListener('keyup', evt => {
    const keyIndex = keysRequired.indexOf(evt.keyCode)

    if (keyIndex > keysDownCount) {
      keysDownCount = keyIndex - 1
    }
  })
}
