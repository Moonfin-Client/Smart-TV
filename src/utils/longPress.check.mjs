// node --conditions=browser src/utils/longPress.check.mjs
import assert from 'node:assert/strict'
import { createRoot } from 'solid-js'

// A clock the check moves by hand.
const timers = new Map()
let nextId = 1
globalThis.setTimeout = (fn) => (timers.set(nextId, fn), nextId++)
globalThis.clearTimeout = (id) => timers.delete(id)
const fire = () => [...timers.entries()].forEach(([id, fn]) => (timers.delete(id), fn()))

const { holdPress } = await import('./longPress.js')
const seen = []
const short = (t) => seen.push(['short', t])
const long = (t) => seen.push(['long', t])

createRoot((dispose) => {
  const hold = holdPress()
  assert.equal(hold.end(short), false, 'a release with nothing held goes on')

  hold.start('a', long)
  hold.start('b', long)
  assert.equal(timers.size, 1, 'the hold ignores its repeats')
  assert.equal(hold.end(short), true)
  assert.deepEqual(seen.splice(0), [['short', 'a']])
  assert.equal(timers.size, 0)

  hold.start('c', long)
  fire()
  assert.deepEqual(seen.splice(0), [['long', 'c']])
  assert.equal(hold.end(short), true, 'the release after a long hold is still taken')
  assert.deepEqual(seen, [], 'and does nothing')

  hold.start('d', long)
  hold.cancel()
  assert.equal(timers.size, 0)
  assert.equal(hold.end(short), false)

  hold.start('e', long)
  dispose()
  assert.equal(timers.size, 0, 'the timer stops with the component')
})
console.log('longPress ok')
