// Self-check for popups.js: node src/pages/Player/popups.check.mjs
import assert from 'node:assert/strict'
import { createPopups } from './popups.js'

const T = 10000000
let clock = 0
const p = createPopups(() => clock)
const intro = { type: 'intro', start: 60 * T, end: 120 * T }
const outro = { type: 'outro', start: 900 * T, end: 960 * T }
const segments = { list: [intro, outro], creditsStart: 900 * T }
const base = { introAction: 'ask', outroAction: 'ask', nextUpBehavior: 'extended', autoPlay: true, nextUpTimeout: 7 }
const at = (sec, s = base, hasNext = true) => p.check(sec * T, { segments, runTicks: 1000 * T, hasNext, s })

assert.equal(at(10).prompt, null)
const first = at(61)
assert.equal(first.prompt.type, 'intro')
assert.equal(first.promptIsNew, true)
assert.equal(first.prompt.remainingSeconds, 59)
const later = at(90)
assert.equal(later.promptIsNew, false, 'stays offered inside the segment')
assert.equal(later.prompt.remainingSeconds, 30)
assert.equal(later.prompt.progress, 0.5)
p.dismissPrompt()
assert.equal(at(91).prompt, null, 'a dismissed prompt stays gone')
assert.equal(at(130).prompt, null)
assert.equal(at(61).prompt.type, 'intro', 'coming back into the segment offers it again')

p.reset()
const auto = { ...base, introAction: 'auto' }
assert.equal(at(61, auto).skipTo, 120 * T)
assert.equal(at(62, auto).skipTo, null, 'skips itself once')
assert.equal(at(30, auto).skipTo, null)
assert.equal(at(61, auto).skipTo, 120 * T, 'a rewind before the start lets it skip again')
p.reset()
assert.equal(at(61, { ...base, introAction: 'none' }).prompt, null)

p.reset()
clock = 1000
p.seeked()
assert.equal(at(61).prompt, null, "a seek into the segment doesn't offer it")
clock = 5000
assert.equal(at(62).prompt, null, 'nor once the hold is over')

// The outro keeps its own prompt, and the card waits for it until its auto hide runs out.
p.reset()
const end = { ...base, nextUpTimeout: 30 }
const atEnd = (sec) => p.check(sec * T, { segments: { list: [{ type: 'outro', start: 950 * T, end: 1000 * T }], creditsStart: 950 * T }, runTicks: 1000 * T, hasNext: true, s: end })
assert.equal(atEnd(951).prompt.type, 'outro')
assert.equal(atEnd(975).nextUp, false, 'no card over the prompt')
p.lapse()
const over = atEnd(976)
assert.equal(over.nextUp, true, 'the card comes up once the prompt lapsed')
assert.equal(over.prompt, null, 'and clears it')
assert.equal(over.countdown, 24)

p.reset()
assert.equal(at(990).nextUp, false)
const near = at(995)
assert.equal(near.nextUp, true)
assert.equal(near.countdown, 5)
p.dismissNextUp()
assert.equal(at(996).nextUp, false, 'Hide keeps the card down')
assert.equal(at(500).nextUp, false)
assert.equal(at(996).nextUp, true, 'a rewind out of the window brings it back')
assert.equal(at(500).nextUp, false, 'with autoplay a seek back takes it down')
assert.equal(at(996, base, false).nextUp, false, 'no next item, no card')
p.reset()
assert.equal(at(996, { ...base, nextUpBehavior: 'disabled' }).nextUp, false)

p.reset()
const manual = { ...base, autoPlay: false }
assert.equal(at(960, manual).nextUp, false)
const early = at(975, manual)
assert.equal(early.nextUp, true, 'without autoplay the card shows for the last 30 seconds')
assert.equal(early.countdown, null)
assert.equal(at(500, manual).nextUp, true, 'and stays up after a seek back')

// Replacing the outro: no prompt, the card at the credits, or the next one straight away on Auto Skip.
p.reset()
const replace = { ...base, replaceSkipOutroWithNextUp: true }
const credits = at(901, replace)
assert.equal(credits.prompt, null)
assert.equal(credits.nextUp, true)
assert.equal(credits.countdown, null, 'no countdown before the timeout')
assert.equal(at(901, replace, false).nextUp, false, 'only when there is a next one')
p.reset()
assert.equal(at(901, { ...replace, outroAction: 'auto' }).playNext, true)
p.dismissNextUp()
assert.equal(at(902, { ...replace, outroAction: 'auto' }).playNext, false, 'moves on once')
p.reset()
assert.equal(at(901, { ...replace, outroAction: 'none' }).nextUp, false)
p.reset()
assert.equal(p.check(901 * T, { segments, runTicks: 1000 * T, hasNext: true, preroll: true, s: replace }).nextUp, false, 'a pre-roll gets no card')

console.log('popups ok')
