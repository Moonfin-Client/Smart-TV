// Run with node --conditions=browser (scripts/checks.mjs does), or solid-js loads its non-reactive server build.
import assert from 'node:assert/strict'
import { createRoot, createEffect, createMemo } from 'solid-js'
import { reactive } from './reactive.js'

const s = reactive({ n: 1, fn: null, obj: { a: 1 } })
let runs = 0
createRoot(() => {
  const double = createMemo(() => s.n * 2)
  createEffect(() => {
    double()
    runs++
  })
})
assert.equal(runs, 1)
s.n = 2
assert.equal(runs, 2)
s.n = 2
assert.equal(runs, 2, 'the same value does not notify')
const f = () => 42
s.fn = f
assert.equal(s.fn, f, 'a function is stored, not called')
const o = { a: 2 }
s.obj = o
assert.equal(s.obj, o, 'an object is replaced')
assert.deepEqual(Object.keys(s), ['n', 'fn', 'obj'])
console.log('reactive ok')
