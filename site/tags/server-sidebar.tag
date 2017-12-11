<server-sidebar>

  <server-section></server-section>
  <!-- TODO: rest of sidebar -->

  <style>
    :scope {
      flex: 0 0 300px;
      overflow-y: auto;

      background: var(--gray-900);
      border-top: 6px solid var(--blue);
      border-right: 1px solid var(--gray-500);

      -webkit-touch-callout: none; /* iOS Safari */
        -webkit-user-select: none; /* Safari */
         -khtml-user-select: none; /* Konqueror HTML */
           -moz-user-select: none; /* Firefox */
            -ms-user-select: none; /* Internet Explorer/Edge */
                user-select: none; /* Non-prefixed version, currently
                                      supported by Chrome and Opera */
    }

    .sidebar-section {
      margin-bottom: 16px;
    }

    .sidebar-subtitle {
      display: flex;
      position: relative;

      align-items: center;
      margin: 16px;
      margin-bottom: 4px;

      z-index: 10;
    }

    .sidebar-subtitle h4 {
      font-size: 14px;
      font-weight: bold;
      text-transform: uppercase;
      color: var(--gray-300);

      margin: 0;
    }

    .sidebar-subtitle-button {
      margin-left: auto;
      padding: 4px 8px;

      font-size: 12px;
      color: var(--green);

      background: var(--green-a2);
      border-radius: 4px;

      cursor: pointer;
    }

    .subtitle-add-button:hover,
    .subtitle-add-button:focus {
      background: var(--green-a3);
    }
  </style>

</server-sidebar>

<server-section class='sidebar-section'>

  <div class='sidebar-subtitle'>
    <h4>Server</h4>
    <div class='sidebar-subtitle-button' onclick={ showAddServerModal }>+ Add</div>
  </div>

  <server-dropdown show={ currentServerURL }></server-dropdown>

  <div class='user-info' if={ loggedIn !== '?' }>
    <div class='user-info-text' if={ loggedIn }>Logged in as <span class='user-info-name'> { username } </span></div>
    <div class='user-info-text' if={ !loggedIn }>Logged out</div>

    <button class='user-info-button' if={ loggedIn } onclick={ logout }>Log out</button>
    <button class='user-info-button' if={ !loggedIn } onclick={ showRegisterModal }>Register</button>
    <button class='user-info-button user-info-button-minor' if={ !loggedIn } onclick={ showLoginModal }>Log in</button>
  </div>

  <modal ref='loginModal' heading='Log in' subheading={ 'to ' + currentServerURL } submit-btn-text='Log in' cancellable onsubmit={ submitLoginModal }>
    <!-- TODO validation -->
    <fancy-input label='username' type='text'></fancy-input>
    <fancy-input label='password' type='password'></fancy-input>
  </modal>

  <modal ref='registerModal' heading='Register' subheading={ 'on ' + currentServerURL } submit-btn-text='Register' cancellable onsubmit={ submitRegisterModal }>
    <!-- TODO validation -->
    <fancy-input label='username' type='text'></fancy-input>
    <fancy-input label='password' type='password'></fancy-input>
  </modal>

  <modal ref='addServerModal' heading='Add server' submit-btn-text='Add server' cancellable onsubmit={ submitAddServerModal }>
    <!-- TODO validation -->
    <fancy-input label='url' type='text'></fancy-input>
  </modal>

  <script>
    const serverURLs = []
    this.currentServerURL = null
    this.loggedIn = '?'
    this.username = undefined
    this.loginInProgress = false

    RiotControl.on('add_server', url => {
      serverURLs.push(url)
    })

    RiotControl.on('switch_server', serverURL => {
      this.currentServerURL = serverURL

      // We don't know if we're logged-in or not on this server yet
      this.loggedIn = '?'

      this.update()
    })

    RiotControl.on('session_id_update', async sessionID => {
      this.loggedIn = '?'
      let sessionObj = sessionID ? await get(this.currentServerURL, 'session/' + sessionID) : { success: false }

      if (sessionObj.success) {
        this.loggedIn = true
        this.username = sessionObj.user.username
      } else {
        this.loggedIn = false
        this.username = undefined
      }

      this.update()
    })

    showLoginModal(evt) {
      evt.preventDefault()
      this.refs.loginModal.open()
    }

    async submitLoginModal({ username, password }) {
      this.loginInProgress = true

      const result = await post(this.currentServerURL, 'login', { username, password })

      if (result.error) {
        if (result.error === 'user not found') {
          throw `There is no user with the username ${username}.`
        } else if (result.error === 'incorrect password') {
          throw 'Incorrect password!'
        } else {
          // Unknown error :/
          console.error('Unknown error while logging in', result.error)
          throw result.error
        }
      } else {
        // Success!!
        RiotControl.trigger('session_id_update', result.sessionID)
      }
    }

    showRegisterModal(evt) {
      evt.preventDefault()
      this.refs.registerModal.open()
    }

    async submitRegisterModal({ username, password }) {
      this.loginInProgress = true

      const result = await post(this.currentServerURL, 'register', { username, password })

      if (result.error) {
        if (result.error === 'username already taken') {
          throw `Username '${username}' already taken.`
        } else if (result.error === 'username invalid') {
          throw `Username '${username}' is invalid`
        } else if (result.error === 'password must be at least 6 characters long') {
          throw 'Password must be at least 6 characters long'
        } else {
          // Unknown error :/
          console.error('Unknown error while registering', result.error)
          throw result.error
        }
      } else if (result.success) {
        // Success!!
      }
    }

    logout() {
      RiotControl.trigger('session_id_update', null)
    }

    showAddServerModal(evt) {
      evt.preventDefault()
      this.refs.addServerModal.open()
    }

    async submitAddServerModal({ url }) {
      try {
        const res = await fetch('//' + url + '/api/')

        // The status code returned should be 418
        if (res.status !== 418) {
          throw -1
        }

        // We should see { bantisocial: true }
        const { bantisocial } = await res.json()
        if (bantisocial !== true) {
          throw -1
        }
      } catch (err) {
        if (err !== -1) {
          console.warn('Error whilst adding server', err)
        }

        throw 'Not a bantisocial chat server'
      }

      if (serverURLs.includes(url)) {
        // This URL is already in the server list, let's just
        // switch to it.
      } else {
        // We've passed all checks - let's add the server to the list.
        RiotControl.trigger('add_server', url)
      }

      RiotControl.trigger('switch_server', url)
    }
  </script>

  <style>
    :scope {
      padding-bottom: 16px;
      border-bottom: 1px solid var(--gray-700);
    }

    .user-info {
      display: flex;
      align-items: center;
      padding: 0 16px;

      font-family: 'Noto Sans', sans-serif;
      font-size: 14px;
      font-weight: normal;
      color: var(--gray-300);
    }

    .user-info-text {
      margin-right: auto;
    }

    .user-info-name {
      color: var(--gray-100);
      text-decoration: none;
    }

    .user-info-button {
      background: var(--blue-a2);
      color: var(--blue);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'Noto Sans', sans-serif;
      font-size: 12px;
      border: none;
    }

    .user-info-button:hover,
    .user-info-button:focus {
      background: var(--blue-a3);
    }

    .user-info-button-minor {
      background: var(--gray-700);
      color: var(--gray-300);
      margin-left: 8px;
    }

    .user-info-button-minor:hover,
    .user-info-button-minor:focus {
      background: var(--gray-700);
      color: var(--gray-100);
    }
  </style>

</server-section>

<server-dropdown class={ 'open': open, 'has-options': servers.length !== 1 } onclick={ toggleOpen }>
  <virtual if={ currentServerURL }>
    <div class='current'> { currentServerURL } </div>
    <div class='panel'>
      <div each={ servers } class={ 'option': true, 'active': currentServerURL === url } onclick={ selectOption }> { url } </div>
    </div>
  </virtual>

  <script>
    this.currentServerURL = null
    this.servers = []
    this.open = false

    RiotControl.on('add_server', serverURL => {
      this.servers.push({ url: serverURL })
      this.update()
    })

    RiotControl.on('switch_server', serverURL => {
      this.currentServerURL = serverURL
      this.update()
    })

    toggleOpen(evt) {
      if (this.servers.length > 1) {
        evt.preventDefault()
        evt.stopPropagation()

        this.open = !this.open
      }
    }

    document.body.addEventListener('click', evt => {
      // A click *anywhere else* should close
      this.open = false
      this.update()
    })

    selectOption({ item }) {
      RiotControl.trigger('switch_server', item.url)
    }
  </script>

  <style>
    :scope {
      display: flex;
      position: relative;

      align-items: center;
      margin: 8px 16px;
      padding: 12px 16px;

      background: var(--gray-700);
      border-radius: 4px;
    }

    :scope.open {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    :scope.open .panel {
      display: block;
    }

    :scope.has-options {
      cursor: pointer;
    }

    :scope.has-options::after {
      display: block;
      content: ' ';

      width: 20px;
      height: 12px;
      margin-left: auto;

      background: no-repeat url('/img/caret-down.svg') center center / 24px;
    }

    .current {
      color: var(--gray-100);
    }

    .panel {
      display: none;

      position: absolute;
      top: 47px;
      left: 0;
      right: 0;
      z-index: 100;

      background: inherit;
      padding: 8px;
      border-top: 1px solid var(--gray-500);

      border-bottom-left-radius: 4px;
      border-bottom-right-radius: 4px;

      cursor: default;
    }

    .option {
      padding: 8px 16px;

      color: var(--gray-100);
      border-radius: 4px;
      margin-bottom: 4px;

      cursor: pointer;
    }

    .option:last-of-type {
      margin-bottom: 0;
    }

    .option:hover {
      background: var(--gray-500);
    }

    .option.active {
      background: var(--blue);
      color: #fff;
    }
  </style>
</server-dropdown>
