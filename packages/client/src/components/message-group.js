const raw = require('choo/html/raw')
const html = require('choo/html')
const mrk = require('../util/mrk')
const { timeAgo } = require('../util/date')

// times are updated outside of choo because we don't need to
// diff the entire tree just to modify times
const updateTimes = () => {
  const times = document.querySelectorAll(`.msg-group time.needs-update`)

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

  return html`<div class='MessageGroup' id=${group.id}>
    <img class='Avatar MessageGroup-authorAvatar' src=${group.authorAvatarURL}/>
    <div class='MessageGroup-contents'>
      <div class='MessageGroup-info'>
        <div class='MessageGroup-authorUsername'>${group.authorUsername}</div>
        ${group.authorFlair ? html`
          <div class='MessageGroup-authorFlair'>${group.authorFlair}</div>
        ` : ''}
        ${timeEl(group.messages[0].date)}
      </div>

      ${group.messages.map(msg => {
        const mrked = mrk(state)(msg.text)

        const tokensWithoutEmptyText = mrked.tokens.filter(t => !(t.name === 'text' && t.text === ' '))
        const bigEmotes = !tokensWithoutEmptyText.find(t => t.name !== 'emote')
          && tokensWithoutEmptyText.length <= 3

        const el = html`<div class='Message ${bigEmotes ? '--big-emotes' : ''}' id=${'msg-' + msg.id}>
          ${raw(mrked.html())}
        </div>`

        el.isSameNode = k => k.id === el.id

        for (const ref of el.querySelectorAll('a.foreignReference')) {
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

module.exports = { component }
