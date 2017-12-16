<message-editor>

  <virtual if={ loggedIn && channelID }>
    <textarea ref='input' class='input mousetrap' placeholder='Enter a message...' onkeydown={ handleKeydown }></textarea>
    <button class='button' onclick={ sendInputMessage }>Send</button>
  </virtual>

  <script>
    this.loggedIn = false
    this.serverURL = null
    this.sessionID = null
    this.channelID = null

    RiotControl.on('switch_server', serverURL => {
      this.serverURL = serverURL

      // We don't know if we're logged-in or not on this server yet
      this.loggedIn = false

      this.update()
    })

    RiotControl.on('session_id_update', async sessionID => {
      const sessionObj = sessionID ? await get(this.serverURL, 'session/' + sessionID) : { success: false }

      if (sessionObj.success) {
        this.loggedIn = true
      } else {
        this.loggedIn = false
      }

      this.sessionID = sessionID
      this.update()
    })

    RiotControl.on('switch_channel_id', channelID => {
      this.channelID = channelID
      this.update()

      // Focus on the input area
      if (this.loggedIn) {
        this.refs.input.focus()
      }
    })

    async handleKeydown(evt) {
      if (evt.keyCode === KEY_ENTER) {
        evt.preventDefault()
        this.sendInputMessage()
      }
    }

    async sendInputMessage() {
      const input = this.refs.input

      input.disabled = true

      await this.sendMessage(input.value)
        .catch(() => input.disabled = false)

      input.value = ''
      input.disabled = false
      input.focus() // Refocus
    }

    async sendMessage(text) {
      if (text.trim().length === 0) {
        return null
      }

      const { success, error, messageID } = await post(this.serverURL, 'send-message', {
        text, sessionID: this.sessionID, channelID: this.channelID,
      })

      if (success) {
        return messageID
      } else {
        throw error
      }
    }
  </script>

  <style>
    :scope {
      display: flex;
      align-items: flex-end;

      margin-top: auto;
      flex-shrink: 0;
      padding: 16px;
    }

    .input {
      flex: 1 1 0;
      padding: 16px;
      margin-right: 16px;
      height: 58px;
      min-height: 58px;
      max-height: 400px;
      overflow-y: auto;

      font-family: inherit;
      font-size: 16px;
      font-weight: normal;
      color: var(--gray-100);

      background: var(--gray-900);
      border-radius: 4px;
      outline: none;
      border: 1px solid var(--gray-500);
    }

    .button {
      width: 58px;
      height: 58px;

      color: transparent;
      text-indent: -99999px;

      background: var(--blue);
      border: none;
      outline: none;
      border-radius: 4px;
      background-image: url('/img/send.svg');
      background-size: default;
      background-position: center;

      cursor: pointer;
    }
  </style>

</message-editor>
