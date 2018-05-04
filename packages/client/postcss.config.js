const cssimport = require('postcss-partial-import')
const nesting = require('postcss-nesting')
const nano = require('cssnano')
const autoprefixer = require('autoprefixer')

module.exports = {
  plugins: [
    cssimport(),
    nesting(),
    autoprefixer(),
    nano({preset: 'default'}),
  ],
}
