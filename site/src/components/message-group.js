// message group component
const css = require('sheetify')
const raw = require('choo/html/raw')
const html = require('choo/html')
const mrk = require('../util/mrk')

// returns 3-character month name from a Date
const month = d => [ 'Jan', 'Feb',' Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ][d.getMonth()]

// converts a milliseconds-date-number to a readable string
// * < 60sec: just now
// * < 30min: X mins (or 1 min)
// * < 24hrs: X hours (or 1 hour) -- rounded, not floored
// * > 24hrs: X days (or 1 day)
// * > 7days: date (e.g. Apr 2)
const stringifyDate = date => {
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

css('prismjs/themes/prism.css')
const prefix = css('./message-group.css')

// times are updated outside of choo because we don't need to
// diff the entire tree just to modify times
const updateTimes = () => {
  const times = document.querySelectorAll(`.${prefix} time.needs-update`)

  for (const time of times) {
    const date = stringifyDate(parseInt(time.dataset.date))

    if (!date.needsUpdate) {
      // we no longer need to update this time
      time.classList.remove('needs-update')
    }

    time.innerText = date.string
  }
}

const component = (state, emit, group) => {
  function timeEl(date) {
    const { needsUpdate, string } = stringifyDate(date)

    return html`<time class=${needsUpdate ? 'needs-update': ''}
         title=${new Date(date).toLocaleString()}
         data-date=${date.toString()}>
      ${string}
    </time>`
  }

  return html`<div class=${prefix} id=${group.id}>
    <img class='icon' src=${group.authorAvatarURL}/>
    <div class='content'>
      <div class='info'>
        <div class='username'>${group.authorUsername}</div>
        ${timeEl(group.messages[0].date)}
      </div>

      ${group.messages.map(msg => {
        const el = html`<div class='message' id=${'msg-' + msg.id}>
          ${raw(mrk(msg.text).html())}
        </div>`

        el.isSameNode = k => k.id === el.id

        for (const ref of el.querySelectorAll('a.channel-ref')) {
          const { server, channel } = ref.dataset

          ref.onclick = () => {
            if (channel) {
              emit('pushState',  `/servers/${server || state.params.host}?c=${channel}`)
            } else {
              emit('pushState',  `/servers/${server}`)
            }
          }
        }

        return el
      })}
    </div>
  </div>`
}

// every minute, update time elements (e.g. "2 mins")
setInterval(updateTimes, 60 * 1000)

module.exports = { component, prefix }
