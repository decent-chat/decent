const cssimport = require('postcss-import')
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
