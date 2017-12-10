<message-group>

  <img class='avatar' src={ author.avatarURL }>

  <div class='content'>
    <div class='info'>
      <div class='username'> { author.username } </div>
      <time class='time' datetime={ time } title={ time.toLocaleString() }> { timeString } </time>
    </div>

    <message each={ messages } content={ content }></message>
  </div>

  <script>
    this.author = opts.author
    this.messages = opts.messages

    this.time = this.messages[0].time
    this.timeString = 'Just now'

    tick() {
      const ago = Date.now() - this.time
      let timeString = ''

      if (ago <= HOUR / 2) {
        // 0 mins - 30 mins ago: mins (6 mins)
        const minsAgo = Math.floor(ago / MINUTE)

        timeString = minsAgo + ' min'
        if (minsAgo !== 1) {
          timeString += 's'
        }
      } else if (ago <= DAY) {
        // 30 mins - 24 hours ago: time (16:09)
        // TODO: option for using am/pm, AM/PM, or HH:SS
        timeString = `${this.time.getHours()}:${this.time.getMinutes()}`
      } else {
        // 24+ hours: date (Dec 10)
        const months = [ 'Jan', 'Feb',' Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ]
        const month = months[this.time.getMonth()]

        timeString = `${month} ${this.time.getDate()}`
      }

      this.update({ timeString })
    }

    const timer = setInterval(this.tick, SECOND)
    this.on('unmount', () => {
      clearInterval(timer)
    })
  </script>

  <style>
    :scope {
      display: flex;

      align-items: flex-start;
      margin-bottom: 16px;

      font-size: 16px;
      color: var(--gray-100);
    }

    .avatar {
      width: 48px;
      height: 48px;

      margin-right: 16px;
      border-radius: 4px;
    }

    .info {
      margin-bottom: 4px;
    }

    .username {
      display: inline-block;
      margin-right: 4px;

      font-weight: bold;
      text-align: right;
    }

    .time {
      display: inline-block;
      color: var(--gray-300);
    }
  </style>

</message-group>

<message>
  <div> { opts.content } </div>

  <!-- TODO: formatting -->
</message>
