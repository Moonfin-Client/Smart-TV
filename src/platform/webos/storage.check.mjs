// localStorage is read only when DB8 doesn't answer, and written or cleared once per save or
// remove, before DB8 is asked. node src/platform/webos/storage.check.mjs
import assert from 'node:assert/strict'

const log = []
const items = {}
globalThis.localStorage = {
  getItem: (k) => (log.push(`get ${k}`), k in items ? items[k] : null),
  setItem: (k, v) => (log.push(`set ${k}`), (items[k] = v)),
  removeItem: (k) => (log.push(`remove ${k}`), delete items[k]),
}
// DB8 answers every call with `db`, or fails it when `db` is null.
let db = { returnValue: true }
class FakeBridge {
  call(uri, params) {
    log.push(uri.slice(uri.lastIndexOf('/') + 1))
    const answer = db
    setTimeout(() => this.onservicecallback(JSON.stringify(answer || { returnValue: false, errorText: 'down' })))
  }
  cancel() {}
}
globalThis.window = { PalmServiceBridge: FakeBridge }
const storage = await import('./storage.js')
await storage.initStorage()

log.length = 0
db = { returnValue: true, results: [{ value: { a: 1 } }] }
assert.deepEqual(await storage.getFromStorage('k'), { a: 1 })
assert.deepEqual(log, ['find'])

log.length = 0
db = { returnValue: true }
assert.equal(await storage.saveToStorage('k', { b: 2 }), true)
assert.deepEqual(log, ['del', 'set moonfin_k', 'put'])
assert.equal(await storage.removeFromStorage('k'), true)
assert.deepEqual(log, ['del', 'set moonfin_k', 'put', 'remove moonfin_k', 'del'])

// DB8 failing falls back to the copy in localStorage.
items.moonfin_k = JSON.stringify({ c: 3 })
log.length = 0
db = null
assert.deepEqual(await storage.getFromStorage('k'), { c: 3 })
assert.deepEqual(log, ['find', 'get moonfin_k'])
assert.equal(await storage.saveToStorage('k', { d: 4 }), true)
assert.equal(items.moonfin_k, JSON.stringify({ d: 4 }))
console.log('webOS storage ok')
