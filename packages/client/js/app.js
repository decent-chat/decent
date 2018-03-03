const { h, render, Component } = require('preact')

class App extends Component {
  render() {
    return <div id='app'>
      Hello, world!
    </div>
  }
}

render(<App />, document.body)
