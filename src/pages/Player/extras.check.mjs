// Self-check for the secondary subtitle, sleep timer and episode browser logic:
// node src/pages/Player/extras.check.mjs
import assert from 'node:assert/strict'
import { register } from 'node:module'

// Some imports leave off ".js", which only Vite resolves.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\\.m?js$/.test(spec)) return next(spec + '.js', ctx)
  return next(spec, ctx)
}`)
)

const sec = await import('./secondarySubtitle.js')
const { createSleepTimer } = await import('./sleepTimer.js')
const lay = await import('../../ui/components/player/layouts.js')
const look = await import('../../ui/components/player/look.js')

const T = 10000000
const track = (index, extra) => ({ index, codec: 'subrip', isTextBased: true, language: 'eng', displayTitle: `Track ${index}`, ...extra })
const streams = [
  track(2),
  track(3, { language: 'spa', displayTitle: 'Spanish' }),
  track(4, { codec: 'ass' }),
  track(5, { isExternal: true, language: 'spa', displayTitle: 'Spanish ext' }),
  track(6, { isEmbeddedNative: true }),
]

assert.equal(sec.isSecondaryEligible(streams[0]), true)
assert.equal(sec.isSecondaryEligible(streams[2]), false, 'ASS is left to the primary')
assert.equal(sec.isSecondaryEligible(streams[4]), false, 'a track the server can\'t pull has no lines')

const ids = (list) => list.map((s) => s.index)
assert.deepEqual(ids(sec.secondaryCandidates(streams, 2, {})), [3, 5], 'the primary and ineligible tracks are left out')
assert.deepEqual(ids(sec.secondaryCandidates(streams, -1, { preferExternal: true })), [5, 2, 3])
assert.deepEqual(ids(sec.secondaryCandidates(streams, -1, { preferredLanguage: 'spa' })), [3, 5, 2], 'the preferred language sorts first')

const saved = sec.secondarySelection(streams, 3)
assert.equal(sec.restoreSecondaryIndex(saved, streams), 3)
assert.equal(sec.restoreSecondaryIndex(undefined, streams), undefined, 'nothing remembered')
assert.equal(sec.restoreSecondaryIndex(sec.secondarySelection(streams, -1), streams), -1, 'off stays off')
const moved = [track(7), track(8, { language: 'spa', displayTitle: 'Spanish' })]
assert.equal(sec.restoreSecondaryIndex(saved, moved), 8, 'the same track is found at another index')
assert.equal(sec.restoreSecondaryIndex(saved, [track(9)]), -1, 'a track that is gone restores as off')

const events = [
  { StartPositionTicks: 10 * T, EndPositionTicks: 12 * T, Text: 'one' },
  { StartPositionTicks: 11 * T, EndPositionTicks: 13 * T, Text: 'two' },
]
assert.equal(sec.secondaryCueText(events, 11.5 * T), 'one\ntwo')
assert.equal(sec.secondaryCueText(events, 14 * T), null)
assert.equal(sec.secondaryCueText(events, 11.5 * T, 1), 'one', 'a positive delay holds the lines back')
assert.equal(sec.clampSecondaryDelay(9), 5)
assert.equal(sec.clampSecondaryDelay(0.1 + 0.2), 0.3, 'steps land on tenths')
assert.equal(sec.offsetLabel(-0.5), '-0.5s')
assert.equal(sec.offsetLabel(0), 'None')

const s = { secondarySubtitleSize: 0, secondarySubtitleOffset: 8, secondarySubtitleColor: '' }
assert.equal(sec.stepSecondarySetting(s, 'secondarySubtitleSize', 1, 44), 48, 'an unset size starts from the primary one')
assert.equal(sec.stepSecondarySetting({ ...s, secondarySubtitleSize: 144 }, 'secondarySubtitleSize', 1, 44), 144)
assert.equal(sec.stepSecondarySetting({ ...s, secondarySubtitleOffset: 0 }, 'secondarySubtitleOffset', -1), 0)
assert.equal(sec.stepSecondarySetting(s, 'secondarySubtitleOffset', 1), 10)
assert.equal(sec.stepSecondarySetting(s, 'secondarySubtitleColor', 1), '#ffffff')
assert.equal(sec.stepSecondarySetting(s, 'secondarySubtitleColor', -1), '#ff0000', 'colors wrap around')

let now = 0
let pending = null
let expired = 0
const sleep = createSleepTimer(() => expired++, {
  now: () => now,
  later: (fn, ms) => (pending = { fn, at: now + ms }),
  cancel: () => (pending = null),
})
sleep.start(30)
assert.equal(sleep.minutes(), 30)
now = 60000
assert.equal(sleep.remainingSeconds(), 29 * 60)
sleep.start(15)
assert.equal(pending.at, 60000 + 15 * 60000, 'a new pick replaces the old timer')
sleep.start(0)
assert.equal(pending, null, 'Off cancels it')
assert.equal(sleep.minutes(), null)
assert.equal(sleep.remainingSeconds(), 0)
sleep.start(45)
pending.fn()
assert.equal(expired, 1)
assert.equal(sleep.minutes(), null, 'it disarms when it fires')

const slot = lay.trackLayout('Subtitles', [
  { id: 'primary', label: 'Primary', detail: 'English' },
  { id: 'secondary', label: 'Secondary', detail: 'None' },
  { divider: true },
  { id: 'cancel', label: 'Cancel', dimmed: true },
], [])
assert.equal(slot.rows[0].y, 70, 'rows start under the 33 title line, its 18 padding, rule and 18 margin')
assert.equal(slot.rows[0].h, 94, 'a row with a detail line')
assert.equal(slot.rows[2].y, slot.rows[1].y + slot.rows[1].h, 'the divider sits right under the row')
assert.equal(slot.rows[3].y, slot.rows[2].y + 9, 'and the next row 8 under it')
assert.equal(slot.contentH, 339, 'the slot dialog is 401 tall with padding and border')
assert.equal(slot.rows[3].h, 72, 'a row without one is as tall as its indicator')
const sleepy = lay.trackLayout('Sleep timer', [{ id: 0, label: 'Off' }], ['Stopping in 1:00', 'Press BACK to close'])
assert.equal(sleepy.footers[1].y - sleepy.footers[0].y, 53, 'footers are 33 lines, 20 apart')

assert.equal(lay.centerIfNeeded(0, 100, 50, 500, 2000), 0, 'a row in view doesn\'t scroll')
assert.equal(lay.centerIfNeeded(0, 900, 100, 500, 2000), 700, 'a row out of view is centered')
assert.equal(lay.centerIfNeeded(0, 1950, 50, 500, 2000), 1500, 'centering stops at the end')
assert.equal(lay.keepInView(0, 600, 228, 666, 3000), 186, 'down scrolls by the overflow and 24')
assert.equal(lay.keepInView(500, 300, 228, 666, 3000), 276, 'up scrolls by the overflow and 24')

assert.equal(lay.episodeLine({ ParentIndexNumber: 2, IndexNumber: 5 }), 'Season 2 · Episode 5')
assert.equal(lay.episodeLine({ IndexNumber: null }), 'Episode ?')
const eps = [
  { Id: 'a', Name: 'A', ParentIndexNumber: 1, IndexNumber: 1, Overview: 'x', UserData: { Played: true } },
  { Id: 'b', Name: 'B', ParentIndexNumber: 1, IndexNumber: 2, RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 25 } },
]
const built = lay.episodeRows(eps, 'b', { thumb: (ep) => `t/${ep.Id}`, hideOverview: true })
assert.deepEqual(built.map((r) => [r.idx, r.current, r.played, r.pct, r.overview, r.thumb]), [
  [0, false, true, 0, '', 't/a'],
  [1, true, false, 25, '', 't/b'],
])
assert.equal(built[0].h, 214, 'a short row is the still, its padding and border')
assert.equal(built[1].y, 228, 'rows are 14 apart')

const tabs = lay.seasonTabs([{ Id: 1, Name: 'Season 1' }, { Id: 2, Name: 'Season 2' }], 0)
assert.equal(tabs[0].x, 4, 'tabs start inside the track padding')
assert.equal(tabs[1].x, tabs[0].x + tabs[0].w, 'tabs butt together')
assert.equal(lay.revealTab(0, { x: 900, w: 300 }, 1000), 200, 'a tab past the edge moves the bar by the least')
assert.equal(lay.revealTab(500, { x: 100, w: 100 }, 1000), 100)

assert.equal(look.focusColor(''), '#00a4dc')
assert.equal(look.focusColor('#FFFF0000'), '#ff0000ff', 'ARGB from the setting becomes RGBA')
assert.equal(look.white(0.08), '#ffffff14')

console.log('player extras ok')
