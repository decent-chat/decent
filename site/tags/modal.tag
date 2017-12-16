<modal class={ 'open': isOpen }>

  <div class='close-button' if={ typeof opts.cancellable !== 'undefined' } onclick={ handleCancel }></div>
  <div class='header' if={ opts.heading }>
    { opts.heading } <span class='header-subtitle' if={ opts.subheading }> { opts.subheading } </span>
  </div>

  <form class='content' onsubmit={ handleSubmit }>
    <div class='error'> { error } </div>

    <yield/>

    <input type='submit' class='button' value={ opts.submitBtnText }>
  </form>

  <script>
    this.isOpen = false

    const getInputs = () => {
      const inputs = this.tags['form-input']

      if (Array.isArray(inputs)) {
        return inputs
      } else {
        // For some reason when there's only one form-input tag
        // `inputs` is just the element, not an array<element>
        return [ inputs ]
      }
    }

    focus() {
      if (getInputs().length > 0) {
        getInputs()[0].focus()
      }
    }

    open() {
      this.focus()

      document.querySelector('.modal-page-cover').style.removeProperty('display')
      this.update({ isOpen: true })
      this.trigger('open')
    }

    close() {
      for (const input of getInputs()) {
        input.clear()
        input.update({ disabled: false })
      }

      document.querySelector('.modal-page-cover').style.display = 'none'
      this.update({ isOpen: false })
      this.trigger('close')
    }

    handleCancel(evt) {
      if (opts.oncancel) {
        opts.oncancel()
      }

      this.close()
    }

    async handleSubmit(evt) {
      if (evt) {
        evt.preventDefault()
        evt.stopPropagation()
      }

      const data = {}

      for (const input of getInputs()) {
        data[input.opts.label] = input.getValue()
        input.update({ disabled: true }) // Disable the input
      }

      try {
        await opts.onsubmit(data)
      } catch (err) {
        // Re-enable inputs
        for (const input of getInputs()) {
          input.update({ disabled: false })
        }

        this.focus()

        // Display error
        return this.update({ error: err })
      }

      this.close()
    }

    this.on('mount', () => {
      const inputs = getInputs()

      for (const [ i, input ] of Object.entries(inputs)) {
        input.on('submit', () => {
          if (i == inputs.length - 1) {
            // Submit the form/modal
            this.handleSubmit()
          } else {
            // Focus on the next input
            inputs[Number(i) + 1].focus()
          }
        })
      }
    })
  </script>

  <style>
    :scope {
      display: none;

      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      max-width: calc(100% - 48px);

      background: var(--gray-900);
      border-radius: 4px;
      overflow: hidden;

      z-index: 950;
    }

    :scope.open {
      display: block;
    }

    .header {
      padding: 56px;
      padding-bottom: 16px;
      background: var(--gray-700);

      font-size: 24px;
      font-weight: normal;
      color: var(--gray-100);

      -webkit-touch-callout: none; /* iOS Safari */
      -webkit-user-select: none; /* Safari */
       -khtml-user-select: none; /* Konqueror HTML */
         -moz-user-select: none; /* Firefox */
          -ms-user-select: none; /* Internet Explorer/Edge */
              user-select: none; /* Non-prefixed version, currently
                                    supported by Chrome and Opera */
    }

    .header-subtitle {
      color: var(--gray-300);
      font-size: 16px;
    }

    .content {
      padding: 56px;
      padding-top: 24px;
    }

    .error {
      color: var(--red);
      margin-bottom: 16px;
    }

    .close-button {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 19px;
      height: 19px;
      background: url('/img/x.svg');
      cursor: pointer;
    }

    .button {
      padding: 8px 16px;

      background: var(--blue);
      border-radius: 4px;
      border: none;

      font-family: 'Noto Sans', sans-serif;
      font-size: 16px;
      color: var(--gray-900);

      cursor: pointer;
    }
  </style>

</modal>
