// node --conditions=browser src/ui/components/library/pageKit.check.mjs
import assert from 'node:assert/strict'
import { createComputed, createRoot, createSignal } from 'solid-js'
import { keyed } from './pageKit.js'

createRoot((dispose) => {
  const [list, setList] = createSignal([{ k: 'a', v: 1 }, { k: 'b', v: 2 }])
  const l = keyed(list, (it) => it.k)
  const keys1 = l.keys()
  assert.deepEqual(keys1, ['a', 'b'])
  const a = l.item('a')
  assert.equal(a().v, 1)

  // A list rebuilt with new objects and the same keys keeps the key list, and each item reads its new object.
  setList([{ k: 'a', v: 10 }, { k: 'b', v: 20 }])
  assert.equal(l.keys(), keys1)
  assert.equal(a().v, 10)

  // An item that left keeps its last object, so a child on its way out never reads undefined.
  setList([{ k: 'b', v: 21 }])
  assert.deepEqual(l.keys(), ['b'])
  assert.equal(a().v, 10)
  dispose()
})

// A child whose object stayed the same doesn't run again when another one changes.
createRoot((dispose) => {
  const kept = { k: 'b', v: 2 }
  const [list, setList] = createSignal([{ k: 'a', v: 1 }, kept])
  const l = keyed(list, (it) => it.k)
  const b = l.item('b')
  let runs = 0
  createComputed(() => {
    b()
    runs++
  })
  assert.equal(runs, 1)
  setList([{ k: 'a', v: 10 }, kept])
  assert.equal(runs, 1)
  setList([{ k: 'a', v: 10 }, { k: 'b', v: 3 }])
  assert.equal(runs, 2)
  assert.equal(b().v, 3)
  dispose()
})
console.log('pageKit ok')
