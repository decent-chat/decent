// Returns <svg ...attrs>...</svg> using svgRaw as the source.
module.exports = (svgRaw, attrs = {}) => {
  const parent = document.createElement('div')
  parent.innerHTML = svgRaw
  const svg = parent.firstChild

  for (let [ key, value ] of Object.entries(attrs)) {
    svg.setAttribute(key, value)
  }

  return svg
}
