// Self-check for mkvTextSource.js's window start: node src/utils/mkvTextSource.check.mjs
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\\.m?js$/.test(spec)) return next(spec + '.js', ctx)
  return next(spec, ctx)
}`)
)

const { windowStart } = await import('./mkvTextSource.js')

// A plain walk to check against, stepping on while the next cue has started.
const walk = (cues, msPerUnit, nowMs) => {
  let first = 0
  while (first + 1 < cues.length && cues[first + 1].time * msPerUnit <= nowMs) first++
  return first
}

let seed = 11
const rand = (n) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
  return (seed >>> 8) % n
}

for (let round = 0; round < 300; round++) {
  const cues = []
  const count = rand(40)
  // Repeated times too, as two tracks' cue points can share one.
  for (let i = 0; i < count; i++) cues.push({ time: rand(500) })
  cues.sort((a, b) => a.time - b.time)
  const msPerUnit = [1, 0.5, 1 / 3, 40][round % 4]
  for (let step = 0; step < 50; step++) {
    const now = rand(25000) - 100
    assert.equal(windowStart(cues, msPerUnit, now), walk(cues, msPerUnit, now), `round ${round} at ${now}`)
  }
}
assert.equal(windowStart([], 1, 100), 0)
assert.equal(windowStart([{ time: 50 }], 1, 0), 0)

console.log('mkvTextSource ok')
