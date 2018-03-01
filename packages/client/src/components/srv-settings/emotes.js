const html = require('choo/html')
const { api, Modal } = require('../../util')

const store = (state, emitter) => {
  const reset = () => state.emotes = {
    list: null, // null if unloaded, array if loaded
    fetching: false,
  }

  reset()

  emitter.on('emotes.fetch', async () => {
    if (!state.sessionAuthorized) return

    state.emotes.fetching = true

    const { emotes } = await api.get(state, 'emotes')

    state.emotes.list = emotes
    state.emotes.fetching = false
    emitter.emit('render')
  })

  // if the server requires authorization, fetch emotes after logging in,
  // because they won't have been set while logged out
  emitter.on('login', async () => {
    if (state.serverRequiresAuthorization) {
      emitter.emit('emotes.fetch')
    }
  })
}

const component = (state, emit) => {
  if (state.emotes.list === null) {
    // not yet loaded

    if (!state.emotes.fetching) {
      emit('emotes.fetch')
    }

    return html`<div class='Page emote-settings'>
      <h1>Emotes <span class='subtitle'>on ${state.params.host}</span></h1>

      Loading...
    </div>`
  }

  const addEmote = () => {
    const modal = new Modal({
      title: 'Add emote',
      subtitle: 'to ' + state.params.host,

      inputs: {
        image: { label: 'Image', type: 'file', accept: 'image/*' },
        shortcode: { label: 'Name', placeholder: 'e.g. thinking' },
      },

      button: 'Add',
    })

    modal.on('submit', async ({ image, shortcode }) => {
      modal.disable()

      if (!image) {
        modal.showError('No image selected')
        modal.disable(false)
        return
      }

      if (shortcode.length < 1) {
        modal.showError('No name given')
        modal.disable(false)
        return
      }

      if (/^[a-zA-Z0-9-_]+$/.test(shortcode) === false) {
        modal.showError('Invalid name - cannot have spaces or special characters; do not include colons')
        modal.disable(false)
        return
      }

      if (state.emotes.list.find(e => e.shortcode === shortcode)) {
        modal.showError(`There is already an emote called :${shortcode}:`)
        modal.disable(false)
        return
      }

      // upload the image file
      const formData = new FormData()
      formData.append('image', image)

      const { path: imageURL } = await api.postRaw(state, 'upload-image?sessionID=' + state.session.id, formData).catch(error => {
        modal.showError('Failed to upload image')
        modal.disable(false)
        throw error
      })

      try {
        await api.post(state, 'emotes', {shortcode, imageURL})
      } catch (error) {
        modal.showError(error.message)
        modal.disable(false)
        throw error
      }

      emit('emotes.fetch')
      modal.close()
    })
  }

  const rows = state.emotes.list.map(emote => {
    const deleteEmote = async () => {
      state.emotes.list = state.emotes.list.filter(e => e.shortcode !== emote.shortcode)
      await api.delete(state, 'emotes/' + emote.shortcode)
      emit('render')
    }

    const row = html`<tr data-emote=${emote.shortcode}>
      <td>
        <img width='32' height='32' src=${'//' + state.params.host + emote.imageURL}/>
      </td>

      <td>
        :${emote.shortcode}:
      </td>

      <td>
        <button class='Button --no-bg --red' onclick=${deleteEmote}>Delete</button>
      </td>
    </tr>`

    row.isSameNode = el => el.dataset && el.dataset.emote === emote.shortcode

    return row
  })

  return html`<div class='Page EmoteSettings'>
    <h1 class='Page-title'>Emotes <span class='Page-subtitle'>on ${state.params.host}</span></h1>

    <table class='Table'>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <br>

    <div class='submit'>
      <button class='Button' onclick=${addEmote}>Add</button>
    </div>
  </div>`
}

module.exports = { store, component }
