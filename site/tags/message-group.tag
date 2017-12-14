<message-group>

  <img class='avatar' src='https://nonfree.news/img/avatar_nanalan.png'>

  <div class='content'>
    <div class='info'>
      <div class='username'> { authorUsername } </div>
      <date class='date' title={ dateObj.toLocaleString() }> { dateString }</date>
    </div>

    <message each={ messages } content={ revisions[0].text }></message>
  </div>

  <script>
    this.dateObj = new Date(this.date)
    this.dateString = 'Just now'
    
    tick() {
      const ago = Date.now() - this.date
      let dateString = ''

      if (ago <= MINUTE) {
        dateString = 'Just now'
      } if (ago <= HOUR / 2) {
        // 1 mins - 30 mins ago: mins (6 mins)
        const minsAgo = Math.floor(ago / MINUTE)

        dateString = minsAgo + ' min'
        if (minsAgo !== 1) {
          dateString += 's'
        }
      } else if (ago <= DAY) {
        // 30 mins - 24 hours ago: date (16:09)
        // TODO: option for using am/pm, AM/PM, or HH:SS
        dateString = `${this.dateObj.getHours()}:${this.dateObj.getMinutes()}`
      } else {
        // 24+ hours: date (Dec 10)
        const months = [ 'Jan', 'Feb',' Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ]
        const month = months[this.dateObj.getMonth()]

        dateString = `${month} ${this.dateObj.getDate()}`
      }

      this.update({ dateString })
    }

    this.on('mount', () => {
      this.tick()
    })

    const dater = setInterval(this.tick, MINUTE)
    this.on('unmount', () => {
      clearInterval(dater)
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

    .date {
      display: inline-block;
      color: var(--gray-300);
    }
  </style>

</message-group>

<message>
  <div> { opts.content } </div>

  <!-- TODO: formatting -->
</message>
