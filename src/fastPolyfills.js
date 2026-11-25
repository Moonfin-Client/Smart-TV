// The ES2015 to 2017 methods Chrome 38 lacks that the app calls all the time, added only where the
// browser has none. The legacy build loads this file ahead of every app chunk (vite.config.js
// additionalLegacyPolyfills), so keep it free of imports.
// core-js treats Chrome 38's native Symbol as unusable (V8 older than 41), so its Array.from
// and Object.fromEntries look for iterators under core-js's own keys and miss native ones:
// Array.from(new Set([1])) comes back empty, and Babel compiles [...set] to Array.from.
// These go through the native Symbol.iterator.
const iteratorOf = (value) => {
  if (value == null) return null
  const sym = typeof Symbol === 'function' && Symbol.iterator
  const method = (sym && value[sym]) || value['@@iterator']
  return typeof method === 'function' ? method.call(value) : null
}

const fromBroken = (() => {
  try {
    return typeof Set === 'function' && Array.from(new Set([1])).length !== 1
  } catch (e) {
    return true
  }
})()

if (!Array.from || fromBroken) {
  Array.from = function from(source, mapFn, thisArg) {
    const out = []
    const it = typeof source === 'string' || Array.isArray(source) ? null : iteratorOf(source)
    if (it) {
      let step = it.next()
      while (!step.done) {
        out.push(step.value)
        step = it.next()
      }
    } else if (source != null) {
      const len = source.length >>> 0
      for (let i = 0; i < len; i++) out.push(typeof source === 'string' ? source.charAt(i) : source[i])
    }
    return mapFn ? out.map((v, i) => mapFn.call(thisArg, v, i)) : out
  }
}

const fromEntriesBroken = (() => {
  try {
    return !Object.fromEntries || Object.fromEntries(new Map([['a', 1]])).a !== 1
  } catch (e) {
    return true
  }
})()

if (fromEntriesBroken) {
  Object.fromEntries = function fromEntries(entries) {
    const out = {}
    Array.from(entries).forEach((pair) => {
      out[pair[0]] = pair[1]
    })
    return out
  }
}

// core-js's versions of the rest run every call through generic wrappers, the hot spots of the
// webOS launch profile, so these are plain loops. vite.config.js leaves them out of core-js.
const define = (target, name, fn) => {
  if (!target[name]) Object.defineProperty(target, name, { value: fn, configurable: true, writable: true })
}
const isEnumerable = Object.prototype.propertyIsEnumerable
define(Object, 'assign', function assign(target) {
  if (target == null) throw new TypeError('Cannot convert undefined or null to object')
  const to = Object(target)
  for (let a = 1; a < arguments.length; a++) {
    const source = arguments[a]
    if (source == null) continue
    const from = Object(source)
    const keys = Object.keys(from)
    for (let k = 0; k < keys.length; k++) to[keys[k]] = from[keys[k]]
    const symbols = Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols(from) : []
    for (let k = 0; k < symbols.length; k++) if (isEnumerable.call(from, symbols[k])) to[symbols[k]] = from[symbols[k]]
  }
  return to
})
define(Object, 'entries', function entries(obj) {
  const o = Object(obj)
  return Object.keys(o).map((k) => [k, o[k]])
})
define(Object, 'values', function values(obj) {
  const o = Object(obj)
  return Object.keys(o).map((k) => o[k])
})
define(Array.prototype, 'find', function find(fn, thisArg) {
  for (let i = 0, len = this.length >>> 0; i < len; i++) if (fn.call(thisArg, this[i], i, this)) return this[i]
  return undefined
})
define(Array.prototype, 'findIndex', function findIndex(fn, thisArg) {
  for (let i = 0, len = this.length >>> 0; i < len; i++) if (fn.call(thisArg, this[i], i, this)) return i
  return -1
})
define(Array.prototype, 'includes', function includes(value, fromIndex) {
  const len = this.length >>> 0
  let i = fromIndex | 0
  if (i < 0) i = Math.max(len + i, 0)
  const nan = value !== value
  for (; i < len; i++) if (this[i] === value || (nan && this[i] !== this[i])) return true
  return false
})
define(String.prototype, 'includes', function includes(search, position) {
  return String(this).indexOf(search, position) !== -1
})
define(String.prototype, 'startsWith', function startsWith(search, position) {
  const str = String(search)
  const at = Math.max(position | 0, 0)
  return String(this).slice(at, at + str.length) === str
})
define(String.prototype, 'endsWith', function endsWith(search, endPosition) {
  const s = String(this)
  const str = String(search)
  const end = endPosition === undefined ? s.length : Math.min(Math.max(endPosition | 0, 0), s.length)
  return end >= str.length && s.slice(end - str.length, end) === str
})
define(String.prototype, 'codePointAt', function codePointAt(position) {
  const s = String(this)
  const i = position | 0
  if (i < 0 || i >= s.length) return undefined
  const hi = s.charCodeAt(i)
  if (hi < 0xd800 || hi > 0xdbff || i + 1 === s.length) return hi
  const lo = s.charCodeAt(i + 1)
  return lo < 0xdc00 || lo > 0xdfff ? hi : (hi - 0xd800) * 0x400 + lo - 0xdc00 + 0x10000
})

// Chrome 38 drops a FontFace's load promise when the face is garbage collected while it loads, so a
// face nothing holds can leave its promise pending for good, which once held boot before its first
// frame. Each face is held until its load settles.
if (typeof FontFace === 'function' && FontFace.prototype.load && !FontFace.prototype.load.holdsFace) {
  const loading = []
  const load = FontFace.prototype.load
  const held = function () {
    const face = this
    loading.push(face)
    const settled = () => {
      const i = loading.indexOf(face)
      if (i >= 0) loading.splice(i, 1)
    }
    const promise = load.apply(this, arguments)
    promise.then(settled, settled)
    return promise
  }
  held.holdsFace = true
  FontFace.prototype.load = held
}
