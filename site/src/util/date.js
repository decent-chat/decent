const second = 1000
const minute = 60 * second
const hour = 60 * minute
const day = 24 * hour
const week = 7 * day

// returns 3-character month name from a Date
const month = d => [ 'Jan', 'Feb',' Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ][d.getMonth()]

// converts a milliseconds-date-number to a readable string
// * < 60sec: just now
// * < 30min: X mins (or 1 min)
// * < 24hrs: X hours (or 1 hour) -- rounded, not floored
// * > 24hrs: X days (or 1 day)
// * > 7days: date (e.g. Apr 2)
module.exports.timeAgo = function(date) {
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
    return { needsUpdate: false, string: `${month(d)} ${d.getDate()}` }
  }

  if (ago > day) {
    return { needsUpdate: true, string: s('day', Math.round(ago / day)) }
  }
}
