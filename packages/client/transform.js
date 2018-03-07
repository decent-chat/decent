const resolve = require('resolve')
const path = require('path')

function nodeResolvePath(modulePath, basedir) {
  try {
    return resolve.sync(modulePath, {basedir, extensions: ['', '.js', '.json', '.svg'],})
  } catch (e) {
    return null
  }
}

function mapPathString(nodePath, state) {
  if (!state.types.isStringLiteral(nodePath)) {
    return
  }

  const sourcePath = nodePath.node.value
  const currentFile = state.file.opts.filename
  const ok = nodeResolvePath(sourcePath, path.dirname(currentFile))

  if (ok) {
    // Already matched a file, so we won't transform this require.
    return
  }

  const sourcePathParts = sourcePath.split('/')
  const componentName = sourcePathParts[sourcePathParts.length - 1]

  {
    const replaceWith = `${sourcePath}/${componentName}.js`
    const okNow = nodeResolvePath(replaceWith, path.dirname(currentFile))

    if (okNow) {
      nodePath.replaceWith(state.types.stringLiteral(replaceWith))
      nodePath.node.pathResolved = true
      return
    }
  }

  if (sourcePath.startsWith('/')) {
    const replaceWith = `${__dirname}/js${sourcePath}/${componentName}.js`
    const okNow = nodeResolvePath(replaceWith, path.dirname(currentFile))

    if (okNow) {
      nodePath.replaceWith(state.types.stringLiteral(replaceWith))
      nodePath.node.pathResolved = true
      return
    }
  }
}

const importVisitors = {
  CallExpression(nodePath, state) {
    if (state.moduleResolverVisited.has(nodePath)) {
      return
    }

    const calleePath = nodePath.get('callee')
    const isRequire = calleePath.node.name === 'require'

    if (isRequire) {
      state.moduleResolverVisited.add(nodePath)
      mapPathString(nodePath.get('arguments.0'), state)
    }
  },
}

const visitor = {
  Program: {
    enter(programPath, state) {
      programPath.traverse(importVisitors, state);
    },

    exit(programPath, state) {
      programPath.traverse(importVisitors, state);
    },
  },
};

module.exports = k => ({
  pre() {
    this.types = k.types

    // We need to keep track of all handled nodes so we do not try to transform them twice,
    // because we run before (enter) and after (exit) all nodes are handled
    this.moduleResolverVisited = new Set()
  },

  visitor,

  post() {
    this.moduleResolverVisited.clear()
  },
})
