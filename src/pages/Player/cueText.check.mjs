// Self-check for cueText.js: node src/pages/Player/cueText.check.mjs
// Its answer has to match a plain scan from the start on every tick.
import assert from 'node:assert/strict'
import { createCueText } from './cueText.js'

const scan = (events, ticks) => {
  let text = ''
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    if (ev.StartPositionTicks <= ticks && ticks <= ev.EndPositionTicks) {
      text = text ? `${text}\n${ev.Text}` : ev.Text
    } else if (ev.StartPositionTicks > ticks) break
  }
  return text
}

let seed = 7
const rand = (n) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
  return (seed >>> 8) % n
}

for (let round = 0; round < 200; round++) {
  const events = []
  const count = rand(60)
  for (let i = 0; i < count; i++) {
    const start = rand(1000)
    // Mostly short lines, some long ones that overlap many, some empty text.
    const end = start + (rand(10) === 0 ? rand(800) : rand(40))
    events.push({ StartPositionTicks: start, EndPositionTicks: end, Text: rand(8) === 0 ? '' : `line ${i}` })
  }
  if (round % 4 !== 0) events.sort((a, b) => a.StartPositionTicks - b.StartPositionTicks)
  const cueText = createCueText()
  let t = -20
  for (let step = 0; step < 400; step++) {
    // Mostly forward, with the odd jump back or ahead, as seeks and delay changes do.
    const r = rand(20)
    t = r === 0 ? t - rand(300) : r === 1 ? t + rand(300) : t + rand(6)
    assert.equal(cueText(events, t), scan(events, t), `round ${round} at ${t}`)
  }
}

const cueText = createCueText()
const a = [{ StartPositionTicks: 0, EndPositionTicks: 10, Text: 'a' }]
assert.equal(cueText(a, 5), 'a')
const b = [{ StartPositionTicks: 0, EndPositionTicks: 10, Text: 'b' }]
assert.equal(cueText(b, 6), 'b', 'a new list is read afresh')
assert.equal(cueText([], 6), '')
assert.equal(cueText(a, NaN), '')
assert.equal(cueText(a, 5), 'a')

console.log('cueText ok')
