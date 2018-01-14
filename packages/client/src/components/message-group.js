// message group component
const css = require('sheetify')
const raw = require('choo/html/raw')
const html = require('choo/html')
const mrk = require('../util/mrk')
const { timeAgo } = require('../util/date')

css('prismjs/themes/prism.css')
const prefix = css('./message-group.css')

// times are updated outside of choo because we don't need to
// diff the entire tree just to modify times
const updateTimes = () => {
  const times = document.querySelectorAll(`.${prefix} time.needs-update`)

  for (const time of times) {
    const date = timeAgo(parseInt(time.dataset.date))

    if (!date.needsUpdate) {
      // we no longer need to update this time
      time.classList.remove('needs-update')
    }

    time.innerText = date.string
  }
}

const component = (state, emit, group) => {
  if (state.emotes.list === null) {
    // emotes haven't been loaded yet, so we won't render anything until that's done
    return html`<div></div>`
  }

  function timeEl(date) {
    const { needsUpdate, string } = timeAgo(date)

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
          ${raw(mrk(state)(msg.text).html())}
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
