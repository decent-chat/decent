const { h, Component } = require('preact')

const second = 1000
const minute = 60 * second
const hour = 60 * minute
const day = 24 * hour
const week = 7 * day
const months = ['Jan', 'Feb',' Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const plural = (t, n) => n + ' ' + t + (n === 1 ? '' : 's')

class TimeAgo extends Component {
  timer = null

  constructor({ date }) {
    super()
    this.setState({agoString: TimeAgo.dateToAgoString(date)})
  }

  static dateToAgoString(date) {
    const ago = Date.now() - date

    if (ago < minute) return plural('second', Math.floor(ago / second)) + ' ago'
    if (ago < 30 * minute) return plural('minute', Math.floor(ago / minute)) + ' ago'
    if (ago < day) return plural('hour', Math.floor(ago / hour)) + ' ago'
    if (ago > week) return months[date.getDate()] + ' ' + date.getDate() // eg. Apr 2
    if (ago > day) return plural('day', Math.floor(ago / day)) + ' ago'
  }

  componentDidMount() {
    this.timer = setInterval(() => {
      this.setState({agoString: TimeAgo.dateToAgoString(this.props.date)})

      if ((Date.now() - this.props.date) > week) {
        // We don't need to update it again if we're displaying the full date.
        clearInterval(this.timer)
        this.timer = null
      }
    }, second)
  }

  componentWillUnmount() {
    if (this.timer) clearInterval(this.timer)
  }

  render({ date }, { agoString }) {
    return <time datetime={date} title={date.toLocaleString()}>
      {agoString}
    </time>
  }
}

module.exports = TimeAgo
