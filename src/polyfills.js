// Chrome 38 (webOS 3) fixes, imported before everything else.
// The Promise extras are missing because core-js only adds them alongside its own Promise, which
// would replace the native one.
import './fastPolyfills.js'

if (typeof Promise === 'function') {
  if (!Promise.prototype.finally) {
    Promise.prototype.finally = function (fn) {
      const P = this.constructor || Promise
      return this.then(
        (v) => P.resolve(fn && fn()).then(() => v),
        (e) => P.resolve(fn && fn()).then(() => {
          throw e
        })
      )
    }
  }
  if (!Promise.allSettled) {
    Promise.allSettled = (items) =>
      Promise.all(
        Array.from(items).map((p) =>
          Promise.resolve(p).then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason })
          )
        )
      )
  }
  if (!Promise.any) {
    Promise.any = (items) =>
      new Promise((resolve, reject) => {
        const list = Array.from(items)
        let pending = list.length
        const errors = []
        if (!pending) reject(new Error('All promises were rejected'))
        list.forEach((p, i) =>
          Promise.resolve(p).then(resolve, (e) => {
            errors[i] = e
            pending -= 1
            if (!pending) {
              const err = new Error('All promises were rejected')
              err.errors = errors
              reject(err)
            }
          })
        )
      })
  }
}

// URLSearchParams on Chrome 38 is core-js's, and its iterators carry only core-js's own iterator
// key, so a spread like [...params.entries()] rejects them. Give them, and DOM collections, the
// native Symbol.iterator.
if (typeof Symbol === 'function' && Symbol.iterator) {
  const selfIterator = function () {
    return this
  }
  if (typeof URLSearchParams === 'function') {
    const proto = URLSearchParams.prototype
    ;['entries', 'keys', 'values'].forEach((name) => {
      const orig = proto[name]
      if (typeof orig !== 'function') return
      proto[name] = function () {
        const it = orig.call(this)
        if (it && !it[Symbol.iterator]) it[Symbol.iterator] = selfIterator
        return it
      }
    })
    if (!proto[Symbol.iterator] && proto.entries) proto[Symbol.iterator] = proto.entries
  }
  const arrayIterator = Array.prototype[Symbol.iterator]
  if (arrayIterator) {
    ;['NodeList', 'HTMLCollection', 'DOMTokenList'].forEach((name) => {
      const C = window[name]
      if (C && C.prototype && !C.prototype[Symbol.iterator]) C.prototype[Symbol.iterator] = arrayIterator
    })
  }
}

// String.prototype.matchAll arrived in Chrome 73.
if (!String.prototype.matchAll) {
  String.prototype.matchAll = function matchAll(re) {
    const flags =
      re.flags !== undefined ? re.flags : (re.global ? 'g' : '') + (re.ignoreCase ? 'i' : '') + (re.multiline ? 'm' : '')
    const rx = new RegExp(re.source, flags.indexOf('g') >= 0 ? flags : `${flags}g`)
    const out = []
    let m = rx.exec(this)
    while (m !== null) {
      out.push(m)
      if (m[0] === '') rx.lastIndex++
      m = rx.exec(this)
    }
    return out[Symbol.iterator]()
  }
}

// Chrome 38's typed arrays have no slice (Chrome 45), and core-js's usage scan left it out, so
// libpgs's segment reader threw on webOS 3 and no PGS line ever drew.
if (typeof Uint8Array === 'function' && !Uint8Array.prototype.slice) {
  ;['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array'].forEach((name) => {
    const T = window[name]
    if (!T || T.prototype.slice) return
    Object.defineProperty(T.prototype, 'slice', {
      configurable: true,
      writable: true,
      value: function slice(begin, end) {
        return new this.constructor(this.subarray(begin === undefined ? 0 : begin, end === undefined ? this.length : end))
      },
    })
  })
}

// Chrome 38's Map and Set, and their iterators, have no Symbol.iterator, so Babel's for-of and
// spread helpers threw on them (Solid's createResource iterates a Set's keys() when it settles)
// and core-js's Array.from(set) came back empty. Each collection's three iterators share one
// prototype, which iterates itself as the spec's do.
if (typeof Symbol === 'function' && Symbol.iterator) {
  ;[['Set', 'values'], ['Map', 'entries']].forEach(([name, method]) => {
    const C = window[name]
    if (!C || C.prototype[Symbol.iterator]) return
    const iteratorProto = Object.getPrototypeOf(new C()[method]())
    if (!iteratorProto[Symbol.iterator]) {
      Object.defineProperty(iteratorProto, Symbol.iterator, {
        configurable: true,
        writable: true,
        value: function () {
          return this
        },
      })
    }
    Object.defineProperty(C.prototype, Symbol.iterator, { configurable: true, writable: true, value: C.prototype[method] })
  })
}
