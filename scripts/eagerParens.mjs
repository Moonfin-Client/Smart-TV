// Chrome 38's V8 compiles a function lazily unless it sits right after a "(", so a SystemJS chunk's
// code was parsed four times: once with the script, then again when the wrapping IIFE,
// the System.register factory and its execute function each first ran. Wrapping those (and every
// other IIFE) in parentheses makes V8 compile them with the script, in one pass. vite.config.js
// runs this over the legacy chunks after terser, which drops such parentheses.
import { parse } from 'acorn'

const isFn = (n) => n && n.type === 'FunctionExpression'

const isRegister = (n) =>
  n.type === 'CallExpression' &&
  n.callee.type === 'MemberExpression' &&
  n.callee.object.type === 'Identifier' &&
  n.callee.object.name === 'System' &&
  !n.callee.computed &&
  n.callee.property.name === 'register'

// The function nodes that run as soon as their chunk loads.
const runsAtLoad = (node, parent, register) => {
  if (!isFn(node) || !parent) return false
  // function(){}() and function(){}.call(this)
  if (parent.type === 'CallExpression' && parent.callee === node) return true
  if (parent.type === 'MemberExpression' && parent.object === node && !parent.computed && /^(call|apply)$/.test(parent.property.name)) return true
  // System.register([deps], function (exports, module) { return { setters, execute: function () {} } })
  if (isRegister(parent) && parent.arguments[parent.arguments.length - 1] === node) return true
  return parent.type === 'Property' && parent.value === node && register && !parent.computed && (parent.key.name || parent.key.value) === 'execute'
}

export function eagerParens(code) {
  const ast = parse(code, { ecmaVersion: 5, sourceType: 'script', preserveParens: true })
  const edits = []
  const walk = (node, parent, register) => {
    if (runsAtLoad(node, parent, register)) edits.push(node)
    const inRegister = register || isRegister(node)
    for (const k in node) {
      const v = node[k]
      if (!v || typeof v !== 'object' || k === 'loc') continue
      if (Array.isArray(v)) {
        for (const c of v) if (c && typeof c.type === 'string') walk(c, node, inRegister)
      } else if (typeof v.type === 'string') walk(v, node, inRegister)
    }
  }
  walk(ast, null, false)
  if (!edits.length) return code
  // Edits never overlap partially (a node either contains another or is apart from it), so
  // inserting from the end keeps every offset valid.
  const marks = []
  for (const n of edits) marks.push([n.start, '('], [n.end, ')'])
  marks.sort((a, b) => b[0] - a[0] || (a[1] === '(' ? 1 : -1))
  let out = code
  for (const [at, ch] of marks) out = out.slice(0, at) + ch + out.slice(at)
  return out
}
