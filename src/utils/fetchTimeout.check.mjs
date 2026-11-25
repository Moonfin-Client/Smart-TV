// Self-check for fetchWithTimeout on an engine without AbortController: node src/utils/fetchTimeout.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})

delete globalThis.AbortController
const timers = new Set()
globalThis.setTimeout = (fn) => {
  const id = {}
  timers.add(id)
  return id
}
globalThis.clearTimeout = (id) => timers.delete(id)
let fetches = 0
let answer = null
globalThis.fetch = () => {
  fetches++
  return new Promise((resolve) => {
    answer = resolve
  })
}
const { fetchWithTimeout } = await import('./fetchTimeout.js')

// A settled request clears its timer.
const done = fetchWithTimeout('http://a', {}, 1000)
answer('ok')
assert.equal(await done, 'ok')
assert.equal(timers.size, 0)

// The caller's abort ends the wait and clears the timer.
const signal = new EventTarget()
signal.aborted = false
const waiting = fetchWithTimeout('http://a', { signal }, 1000)
signal.aborted = true
signal.dispatchEvent(new Event('abort'))
await assert.rejects(waiting, { name: 'AbortError' })
assert.equal(timers.size, 0)

// An aborted signal never sends the request.
const before = fetches
await assert.rejects(fetchWithTimeout('http://a', { signal }, 1000), { name: 'AbortError' })
assert.equal(fetches, before)
console.log('fetchTimeout ok')
