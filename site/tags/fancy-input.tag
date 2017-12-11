<fancy-input>
  <label> { opts.label } </label>
  <input ref='input' type={ opts.type } placeholder={ opts.placeholder } disabled={ disabled } keydown={ keydown }>

  <script>
    // TODO: add validation support

    clear() {
      this.refs.input.value = ''
    }

    focus() {
      setTimeout(() => {
        this.refs.input.focus()
      }, 50)
    }

    keydown(evt) {
      // Enter/return key
      if (evt.keyCode === 13) {
        this.trigger('submit')
        evt.preventDefault()
      }
    }

    getValue() {
      return this.refs.input.value
    }
  </script>

  <style>
    :scope {
      display: block;
      margin-bottom: 16px;
    }

    label {
      display: block;

      color: var(--gray-300);
      font-weight: bold;
      font-size: 14px;

      text-transform: uppercase;
      margin-bottom: 4px;
    }

    input {
      width: 300px;
      padding: 8px 16px;

      font-family: 'Noto Sans', sans-serif;
      font-size: 14px;

      border: 1px solid var(--gray-500);
      border-radius: 4px;

      color: var(--gray-100);
      background: var(--gray-900);
    }

    input:focus {
      border-color: var(--blue);
    }
  </style>
</fancy-input>
