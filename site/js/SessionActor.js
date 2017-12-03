import Actor from './Actor.js'
import { get, post } from './api.js'

export default class SessionActor extends Actor {
  init() {
    // When there's a session update, update the UI too.
    this.on('update', (loggedIn, sessionObj) => {
      const loginStatusEl = document.getElementById('login-status')
      const [ registerEl, loginEl, logoutEl ] = document.querySelectorAll('.session-action-btn')

      // TODO: should probably use a CSS class at some app root level
      //       for showing/hiding the buttons based on login state.

      if (loggedIn) {
        loginStatusEl.innerText = 'Logged in as ' + sessionObj.user.username

        registerEl.style.display = 'none'
        loginEl.style.display = 'none'
        logoutEl.style.removeProperty('display')
      } else {
        loginStatusEl.innerText = 'Not logged in'

        registerEl.style.removeProperty('display')
        loginEl.style.removeProperty('display')
        logoutEl.style.display = 'none'
      }
    })

    document.getElementById('register').addEventListener('click', () => {
      this.promptRegister()
    })

    document.getElementById('login').addEventListener('click', () => {
      this.promptLogin()
    })

    document.getElementById('logout').addEventListener('click', () => {
      this.loadSessionID('')
    })
  }

  go() {
    // Load session from LocalStorage, if it has that data.
    if ('sessionID' in localStorage) {
      this.loadSessionID(localStorage.sessionID)
    } else this.loadSessionID('')
  }

  isCurrentUser(userID) {
    if (!this.loggedIn) return false
    else return this.sessionObj.user.id === userID
  }

  async loadSessionID(sessionID = '') {
    const sessionData = sessionID === ''
      ? { success: false } // No sessionID = logged out
      : await get('session/' + sessionID)

    if (sessionData.success) {
      this.loggedIn = true
      this.sessionObj = sessionData
      localStorage.sessionID = sessionID
    } else {
      this.loggedIn = false
      this.sessionObj = {}
    }

    this.sessionID = sessionID
    this.emit('update', this.loggedIn, this.sessionObj)
  }

  async promptLogin() {
    const username = prompt('Username?')

    if (username === null) {
      return
    }

    const password = prompt('Password?')

    if (password === null) {
      return
    }

    if (!username || !password ) {
      alert('Please enter both a username and a password.')
    }

    const result = await post('login', {username, password})

    if (result.error) {
      if (result.error === 'user not found') {
        alert(`There is no user with the username ${username}.`)
      } else if (result.error === 'incorrect password') {
        alert(`Incorrect password!`)
      }
      return
    }

    await this.loadSessionID(result.sessionID)
  }

  async promptRegister() {
    const username = prompt('Username?')

    if (username === null) {
      this.emit('registration cancel')
      return
    }

    const password = prompt(
      'Password? (Must be at least 6 characters long.)\n' +
      'This password is NOT secure yet! It is stored securely, but you are probably not on an HTTPS connection.\n' +
      'That means just about anyone can look at your HTTP request and find out your password.\n' +
      'DO NOT use something you use anywhere else!'
    )

    if (password === null) {
      this.emit('registration cancel')
      return
    }

    if (!username || !password) {
      alert('Please enter both a username and a password.')

      this.emit('registration error', 'enter both username and password')
      return
    }

    const result = await post('register', {username, password})

    if (result.error) {
      if (result.error === 'password must be at least 6 characters long') {
        alert('Couldn\'t create account - password too short.')
      } else if (result.error === 'username already taken') {
        alert('Couldn\'t create account - username already taken.')
      } else if (result.error === 'username invalid') {
        alert('Couldn\'t create account - username is invalid (only alphanumeric, underscores, and dashes allowed)')
      }

      this.emit('registration error', result.error)
      return result.error
    }

    alert(`Success! Account ${username} created. Please log in.`)
    this.emit('registration success', result.user)

    return result.user
  }
}
