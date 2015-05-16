'use strict'
var clone = require('lodash.clonedeep')
var union = require('lodash.union')
var without = require('lodash.without')
var validate = require('aproba')
var flattenTree = require('./flatten-tree.js')
var npm = require('../npm.js')
var isExtraneous = require('./is-extraneous.js')
var validatePeerDeps = require('./deps.js').validatePeerDeps

var logicalTree = module.exports = function (tree) {
  validate('O', arguments)
  var newTree = clone(tree)
  var flat = flattenTree(newTree)
  function getNode (flatname) { return flat[flatname] }
  Object.keys(flat).sort().forEach(function (flatname) {
    var node = flat[flatname]
    var requiredBy = node.package._requiredBy || []
    var requiredByNames = requiredBy.filter(function (parentFlatname) {
      var parentNode = getNode(parentFlatname)
      if (!parentNode) return false
      return parentNode.package.dependencies[node.package.name] ||
             parentNode.package.devDependencies[node.package.name]
    })
    var requiredBy = requiredByNames.map(getNode)

    node.requiredBy = requiredBy

    if (!requiredBy.length) return

    if (node.parent) node.parent.children = without(node.parent.children, node)

    requiredBy.forEach(function (parentNode) {
      parentNode.children = union(parentNode.children, [node])
    })
  })
  return newTree
}

module.exports.asReadInstalled = function (tree) {
  return translateTree(logicalTree(tree))
}

function translateTree (tree) {
  var pkg = tree.package
  if (pkg._dependencies) return pkg
  pkg._dependencies = pkg.dependencies
  pkg.dependencies = {}
  tree.children.forEach(function (child) {
    pkg.dependencies[child.package.name] = translateTree(child)
  })
  Object.keys(tree.missingDeps).forEach(function (name) {
    if (pkg.dependencies[name]) {
      pkg.dependencies[name].invalid = true
      pkg.dependencies[name].realName = name
      pkg.dependencies[name].extraneous = false
    } else {
      pkg.dependencies[name] = tree.missingDeps[name]
    }
  })
  validatePeerDeps(tree, function (tree, pkgname, version) {
    pkg.dependencies[pkgname] = {
      _id: pkgname + '@' + version,
      name: pkgname,
      version: version,
      peerMissing: true
    }
  })
  pkg.path = tree.path

  pkg.extraneous = isExtraneous(tree)
  if (tree.target && tree.parent && !tree.parent.target) pkg.link = tree.realpath
  return pkg
}