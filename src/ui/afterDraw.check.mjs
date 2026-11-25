// Checks afterDraw: fn waits for the next frame and runs after it, once, and a cancel or a frame
// that never comes are handled.
//   node src/ui/afterDraw.check.mjs
import assert from 'node:assert/strict'
import { afterDraw } from './afterDraw.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fakeRenderer = () => {
  const listeners = []
  return {
    on: (e, f) => listeners.push(f),
    off: (e, f) => listeners.indexOf(f) >= 0 && listeners.splice(listeners.indexOf(f), 1),
    frame: () => listeners.slice().forEach((f) => f()),
    count: () => listeners.length,
  }
}

// Nothing runs until a frame, and then only after it.
{
  const r = fakeRenderer()
  const log = []
  afterDraw(r, () => log.push('fn'), 1000)
  await sleep(10)
  assert.deepEqual(log, [])
  r.frame()
  log.push('frame drawn')
  await sleep(5)
  assert.deepEqual(log, ['frame drawn', 'fn'])
  assert.equal(r.count(), 0)
  r.frame()
  await sleep(5)
  assert.deepEqual(log, ['frame drawn', 'fn'])
}
// No frame: it runs after ms.
{
  const r = fakeRenderer()
  let ran = 0
  afterDraw(r, () => ran++, 20)
  await sleep(40)
  assert.equal(ran, 1)
  assert.equal(r.count(), 0)
}
// Canceled: it never runs.
{
  const r = fakeRenderer()
  let ran = 0
  const cancel = afterDraw(r, () => ran++, 20)
  cancel()
  r.frame()
  await sleep(40)
  assert.equal(ran, 0)
  assert.equal(r.count(), 0)
}
console.log('afterDraw.check ok')
