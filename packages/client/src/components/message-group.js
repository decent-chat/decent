const raw = require('choo/html/raw')
const html = require('choo/html')
const { svg, mrk, api } = require('../util')
const { timeAgo } = require('../util/date')

// times are updated outside of choo because we don't need to
// diff the entire tree just to modify times
const updateTimes = () => {
  const times = document.querySelectorAll(`.MessageGroup time.needs-update`)

  for (const time of times) {
    const date = timeAgo(parseInt(time.dataset.date))

    if (!date.needsUpdate) {
      // we no longer need to update this time
      time.classList.remove('needs-update')
    }

    time.innerText = date.string
  }
}

const component = (state, emit, group, { withActions = true, showFlair = true, msgIDprefix = 'msg-' } = {}) => {
  if (state.emotes.list === null) {
    // Emotes haven't been loaded yet, so we won't render anything until that's done
    return html`<div></div>`
  }

  const editMsg = msg => evt => {
    // TODO
  }

  const pinMsg = msg => async evt => {
    await api.post(state, `channels/${state.params.channel}/pins`, {messageID: msg.id})
  }

  const unpinMsg = msg => async evt => {
    await api.delete(state, `channels/${state.params.channel}/pins/${msg.id}`)
  }

  const deleteMsg = msg => async evt => {
    // TODO: confirm modal

    await api.delete(state, `messages/${msg.id}`)
  }

  const timeEl = date => {
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
        ${group.authorFlair && showFlair ? html`
          <div class='MessageGroup-authorFlair'>${group.authorFlair}</div>
        ` : ''}
        ${timeEl(group.messages[0].date)}
      </div>

      ${group.messages.map(msg => {
        const mrked = mrk(state)(msg.text)

        const tokensWithoutEmptyText = mrked.tokens.filter(t => !(t.name === 'text' && t.text === ' '))
        const bigEmotes = !tokensWithoutEmptyText.find(t => t.name !== 'emote')
          && tokensWithoutEmptyText.length <= 3

        const isPinned = !!state.pins.messages.find(pin => pin.id === msg.id)

        const el = html`<div class='Message ${bigEmotes ? '--big-emotes' : ''}' id=${msgIDprefix + msg.id}>
          <div class='Message-content'>${raw(mrked.html())}</div>
          ${withActions ? html`
            <div class='Message-actions'>
              ${state.session.user && msg.authorID === state.session.user.id
                ? html`<div class='Message-actions-action' title='Edit' onclick=${editMsg(msg)}>
                  ${svg(require('../../img/edit.svg'))}
                </div>
              ` : document.createTextNode('')}
              ${state.session.user && state.session.user.permissionLevel === 'admin'
                ? html`<div class='Message-actions-action' title=${isPinned ? 'Pinned' : 'Pin'} onclick=${isPinned ? unpinMsg(msg) : pinMsg(msg)}>
                  ${svg(isPinned ? require('../../img/remove-paperclip.svg') : require('../../img/paperclip.svg'))}
                </div>
              ` : document.createTextNode('')}
              ${state.session.user && (msg.authorID === state.session.user.id || state.session.user.permissionLevel === 'admin')
                ? html`<div class='Message-actions-action' title='Delete' onclick=${deleteMsg(msg)}>
                  ${svg(require('../../img/trash.svg'))}
                </div>
              ` : document.createTextNode('')}
            </div>
          ` : document.createTextNode('')}
        </div>`

        // TODO: make this less bad
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
