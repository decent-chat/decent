<server-sidebar>

  <server-section></server-section>
  <channels-section></channels-section>

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

    .location-list {
      display: flex;
      flex-direction: column;
      margin: 8px 16px;
    }

    .list-item {
      display: flex;
      position: relative;

      align-items: center;
      padding: 8px 16px;
      margin-bottom: 4px;

      font-size: 16px;
      font-weight: normal;
      color: var(--gray-100);
      text-decoration: none;

      border-radius: 4px;
    }

    .list-item:hover {
      background: var(--gray-700);
    }

    .list-item.active {
      background: var(--blue);
      color: var(--gray-900);
    }

    .list-item.notification::after {
      display: block;
      content: ' ';

      position: absolute;
      top: 9px;
      left: 18px;
      width: 6px;
      height: 6px;

      border-radius: 99px;
      background: var(--red);
      border: 2px solid var(--gray-900);
    }

    .list-item.notification:hover::after {
      border-color: var(--gray-700);
    }

    .list-item.notification.active::after {
      border-color: var(--blue);
    }

    .list-break {
      height: 1px;
      margin: 4px 0 8px 0;
      background: var(--gray-700);
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
    <form-input label='username' type='text'></form-input>
    <form-input label='password' type='password'></form-input>
  </modal>

  <modal ref='registerModal' heading='Register' subheading={ 'on ' + currentServerURL } submit-btn-text='Register' cancellable onsubmit={ submitRegisterModal }>
    <!-- TODO validation -->
    <form-input label='username' type='text'></form-input>
    <form-input label='password' type='password'></form-input>
  </modal>

  <modal ref='addServerModal' heading='Add server' submit-btn-text='Add server' cancellable onsubmit={ submitAddServerModal }>
    <!-- TODO validation -->
    <form-input label='url' type='text'></form-input>
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
      const sessionObj = sessionID ? await get(this.currentServerURL, 'session/' + sessionID) : { success: false }

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
      if (serverURLs.includes(url)) {
        // This URL is already in the server list, let's just
        // switch to it.
      } else {
        // Make sure `url` is actually a bantisocial server!
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

            // window.fetch() will reject with a TypeError when a network
            // error is encountered, e.g. "not a url" or some kind of
            // permissions issue.
            if (err instanceof TypeError) {
              throw 'Network error'
            } else {
              throw 'Internal error (see JS console)'
            }
          } else {
            throw 'Not a bantisocial chat server'
          }
        }

        // We've passed all checks - let's add the server to the list.
        RiotControl.trigger('add_server', url)
      }

      // Switch to the server
      window.location.hash = '#/+' + url
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
      window.location.hash = '#/+' + item.url
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

<channels-section class='sidebar-section'>

  <virtual if={ currentServerURL }>
    <div class='sidebar-subtitle'>
      <h4>Channels</h4>
      <div class='sidebar-subtitle-button' if={ user.permissionLevel === 'admin' } onclick={ showAddChannelModal }>+ Add</div>
    </div>

    <div class='location-list'>
      <a each={ channels } class={ getListItemClass(name) } onclick={ selectChannel }> { name } </a>
    </div>
  </virtual>

  <script>
    this.sessionID = null
    this.user = {}

    this.currentChannelName = null
    this.currentServerURL = null
    this.channels = []

    const getCurrentIndex = () => this.channels
      .findIndex(c => c.name === this.currentChannelName)

    getListItemClass(channelName) {
      return {
        'list-item': 1,
        'active': channelName === this.currentChannelName,
        // TODO: notification
      }
    }

    RiotControl.on('switch_server', serverURL => {
      this.currentChannelName = null
      this.currentServerURL = serverURL
      this.channels = []

      this.loadChannels()
      this.update()
    })

    RiotControl.on('session_id_update', async sessionID => {
      this.sessionID = sessionID

      this.user = {}
      this.update()

      const sessionObj = sessionID ? await get(this.currentServerURL, 'session/' + sessionID) : { success: false }

      if (sessionObj.user) {
        this.user = sessionObj.user
        this.loadChannels() // for unread data
        this.update()
      }
    })

    async loadChannels() {
      const query = this.sessionID ? { sessionID: this.sessionID } : {}
      const { success, channels } = await get(this.currentServerURL, 'channel-list', query)

      if (success) {
        this.channels = channels
        this.update()

        if (this.currentChannelName === null) {
          let { channelName } = parseHash()

          if (channelName) {
            this.currentChannelName = channelName
            this.update()
          } else {
            channelName = this.switchToDefaultChannel()
          }

          const channelObj = this.channels.find(c => c.name === channelName)
          RiotControl.trigger('switch_channel_id', channelObj.id)
        }
      }
    }

    selectChannel({ item }) {
      window.location.hash = `#/+${currentServerURL}#${item.name}`
    }

    switchToDefaultChannel() {
      // Default to first channel
      // TODO: add and use 'default channel' server setting
      if (this.channels.length > 0) {
        this.selectChannel({ item: this.channels[0] })

        return this.channels[0].name
      }

      return null
    }

    RiotControl.on('switch_channel', channelName => {
      const channelObj = this.channels.find(c => c.name === channelName)

      if (channelName === null && this.channels.length > 0) {
        this.switchToDefaultChannel()
      } else if (!channelObj) {
        if (this.channels.length > 0) {
          console.warn('no channel named', channelName)
          this.switchToDefaultChannel()
        } else {
          RiotControl.trigger('switch_channel_id', null)
        }
      } else {
        this.currentChannelName = channelName
        this.update()

        RiotControl.trigger('switch_channel_id', channelObj.id)
      }
    })

    Mousetrap.bind('alt+up', () => {
      if (this.channels.length <= 1) {
        return
      }

      const currentIndex = getCurrentIndex()
      const channelAboveIndex = currentIndex === 0
        ? this.channels.length - 1
        : currentIndex - 1

      const channelAbove = this.channels[channelAboveIndex]
      this.selectChannel({ item: channelAbove })
    })

    Mousetrap.bind('alt+down', () => {
      if (this.channels.length <= 1) {
        return
      }

      const currentIndex = getCurrentIndex()
      const channelBelowIndex = currentIndex === this.channels.length - 1
        ? 0
        : currentIndex + 1

      const channelBelow = this.channels[channelBelowIndex]
      this.selectChannel({ item: channelBelow })
    })
  </script>

  <style>
    .list-item {
      cursor: pointer;
    }

    .list-item::before {
      display: inline;
      content: '#';

      margin-right: 8px;
      margin-left: -4px;

      font-weight: bold;
      color: var(--gray-500);
    }

    .list-item.active::before {
      color: #afceff;
    }
  </style>

</channels-section>
