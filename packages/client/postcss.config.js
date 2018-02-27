const cssimport = require('postcss-import')
const nesting = require('postcss-nesting')
const nano = require('cssnano')

module.exports = {
  plugins: [
    cssimport(),
    nesting(),
    nano({preset: 'default'}),
  ],
}
