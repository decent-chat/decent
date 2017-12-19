const html = require('choo/html')
const raw = require('choo/html/raw')
const mrk = require('mrk.js')

// TODO add mrk patterns for channelrefs and mentions

// returns 3-character month name from a Date
function month(d) {
  const months = [ 'Jan', 'Feb',' Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ]
  return months[d.getMonth()]
}

// converts milliseconds-date to a readable string
// * < 60sec: just now
// * < 30min: X mins (or 1 min)
// * < 24hrs: X hours (or 1 hour) -- rounded, not floored
// * > 24hrs: X days (or 1 day)
// * > 7days: date (e.g. Apr 2)
function stringifyDate(date) {
  const second = 1000
  const minute = 60 * second
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  const s = (t, n) => n + ' ' + t + (n === 1 ? '' : 's')

  const ago = Date.now() - date

  if (ago < minute) {
    return { needsUpdate: true, string: 'Just now' }
  }

  if (ago < 30 * minute) {
    return { needsUpdate: true, string: s('min', Math.round(ago / minute)) }
  }

  if (ago < 24 * hour) {
    return { needsUpdate: true, string: s('hour', Math.round(ago / hour)) }
  }

  if (ago > week) {
    const d = new Date(date)
    return { needsUpdate: false, string: month(d) + d.getDate() }
  }

  if (ago > day) {
    return { needsUpdate: true, string: s('day', Math.round(ago / day)) }
  }
}

module.exports = {
  messageGroup: (state, emit) => group => {
    const avatarURL = 'https://seccdn.libravatar.org/avatar/md5-hash-of-author-email' // TODO

    function timeEl(date) {
      const { needsUpdate, string } = stringifyDate(date)

      return html`<div class='message-group-time ${needsUpdate ? 'needs-update': ''}'
           title=${new Date(date).toLocaleString()}
           data-date=${date.toString()}>
        ${string}
      </div>`
    }

    return html`<div class='message-group' id=${group.id}>
      <img class='message-group-icon' src=${avatarURL}/>
      <div class='message-group-content'>
        <div class='message-group-info'>
          <div class='message-group-name'>${group.authorUsername}</div>
          ${timeEl(group.messages[0].date)}
        </div>

        ${group.messages.map(msg => html`<div class='message' id=${'msg-' + msg.id}>
          ${raw(mrk(msg.text).html())}
        </div>`)}
      </div>
    </div>`
  },

  // groups messages where:
  //  * the messages have the same author
  //  * the group has <= 20 messages
  //  * the messages are < 30 min apart
  groupMessages: msgs => {
    const groups = []

    // milliseconds between messages (30min)
    const apart = 30 * 60 * 1000 // TODO make this per-user/client via storage

    for (const msg of msgs) {
      const group = groups[groups.length - 1]

      const useLastGroup = typeof group !== 'undefined'
        && group.authorID === msg.authorID
        && group.messages.length <= 20
        && (msg.date - group.messages[group.messages.length - 1].date) < apart

      if (!useLastGroup) {
        // create a new group for this message
        groups.push({
          authorID: msg.authorID,
          authorUsername: msg.authorUsername,
          messages: [ msg ],
          id: 'msg-group-' + msg.date,
        })
      } else {
        // add this message to the last group
        group.messages.push(msg)
        group.id = 'msg-group-' + msg.date
      }
    }

    return groups
  },

  // times are updated outside of choo because we don't need to
  // diff the entire tree just to modify times
  updateTimes() {
    const times = document.querySelectorAll('.message-group-time.needs-update')

    for (const time of times) {
      const date = stringifyDate(parseInt(time.dataset.date))

      if (!date.needsUpdate) {
        // we no longer need to update this time
        time.classList.remove('needs-update')
      }

      time.innerText = date.string
    }
  },
}
