// Self-check for liveRecording.js: node src/pages/Player/liveRecording.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx)
  },
})
const { createLiveRecording, recordDialog, recordingFor, seriesDialog, timerFor } = await import('./liveRecording.js')

const NOW = Date.parse('2026-11-23T13:10:00Z')
const iso = (ms) => new Date(ms).toISOString()
const prog = (extra = {}) => ({ Id: 'p1', Name: 'Bluey', StartDate: iso(NOW - 600000), EndDate: iso(NOW + 900000), ...extra })
const timer = (status, extra = {}) => ({ Id: `t-${status}`, ProgramId: 'p1', Status: status, ...extra })

// Timers: a running one wins over a waiting one, ids match with or without dashes, others don't count.
assert.equal(timerFor(prog(), [timer('New'), timer('InProgress')]).Status, 'InProgress')
assert.equal(timerFor(prog({ TimerId: 'ab-cd' }), [{ Id: 'abcd', Status: 'New' }]).Id, 'abcd')
assert.equal(timerFor(prog(), [timer('Cancelled'), timer('Completed')]), null)

// Availability and the mark.
assert.equal(recordingFor(prog(), null, NOW, false).available, false, 'no api')
assert.equal(recordingFor(prog({ EndDate: iso(NOW) }), null, NOW, true).available, false, 'ended')
assert.equal(recordingFor(prog({ StartDate: iso(NOW) }), null, NOW, true).available, true, 'first instant counts')
const mark = (p, timers) => recordingFor(p, { program: p, timers }, NOW, true).mark
assert.equal(mark(prog(), []), null)
assert.equal(mark(prog(), [timer('InProgress')]), 'record')
assert.equal(mark(prog(), [timer('New')]), 'scheduled')
assert.equal(mark(prog(), [timer('InProgress', { SeriesTimerId: 's1' })]), 'series')
assert.equal(mark(prog({ SeriesTimerId: 's1' }), []), 'skipped')
// A fetch for another program is ignored.
assert.equal(recordingFor(prog(), { program: { Id: 'other' }, timers: [timer('InProgress')] }, NOW, true).mark, null)

// The next series recording is the earliest waiting timer of the rule still ahead.
const p = prog({ SeriesTimerId: 's1' })
const later = (id, mins, extra) => ({ Id: id, SeriesTimerId: 's1', Status: 'New', StartDate: iso(NOW + mins * 60000), ...extra })
const rec = recordingFor(p, { program: p, timers: [later('b', 120), later('a', 60), later('c', 30, { Status: 'Cancelled' }), later('d', -5)] }, NOW, true)
assert.equal(rec.nextSeriesRecording.Id, 'a')

// The dialog.
const main = recordDialog(recordingFor(prog({ IsSeries: true, EpisodeTitle: 'Camping' }), null, NOW, true), '12-hour')
assert.equal(main.title, 'Bluey')
assert.deepEqual(main.rows.map((r) => r.id || 'div'), ['record', 'series', 'div', 'close'])
assert.equal(main.rows[0].label, 'Record This Episode')
assert.equal(main.rows[1].label, 'Record Series')
assert.equal(main.rows[3].start, true, 'Close holds focus')
assert.ok(/ – /.test(main.details[0].text))
assert.equal(recordDialog(recordingFor(prog(), null, NOW, true)).rows[0].label, 'Record This Program')
const skipped = recordDialog(rec)
assert.deepEqual(skipped.rows.map((r) => r.label || 'div'), ['Record This Program', 'Series Settings', 'Cancel Series Recording', 'div', 'Close'])
assert.deepEqual(skipped.details.filter((d) => d.note).map((d) => d.text.split(':')[0]), ['The series recording will skip this showing', 'Next series recording'])
const running = recordDialog(recordingFor(p, { program: p, timers: [timer('InProgress', { SeriesTimerId: 's1' })] }, NOW, true))
assert.equal(running.rows[0].label, 'Cancel This Recording')
assert.deepEqual(running.details.filter((d) => d.note).map((d) => d.text), ['Series recording is scheduled, but the guide has no upcoming episodes'])
assert.deepEqual(seriesDialog(null).rows.map((r) => r.selected), [false, true, false])
assert.deepEqual(seriesDialog({ RecordNewOnly: true }).rows.map((r) => r.selected), [false, false, true])

// The controller: fetches as the controls come up, ticks each minute while they stay up, stops when they go.
const calls = []
const toasts = []
let changed = 0
let program = prog({ IsSeries: true })
let timers = []
const api = {
  getLiveTvProgram: async (id) => (calls.push(`program ${id}`), program),
  getLiveTvTimers: async () => (calls.push('timers'), { Items: timers }),
  createLiveTvTimer: async () => {
    calls.push('create')
    throw new Error('blocked')
  },
  cancelLiveTvTimer: async (id) => calls.push(`cancel ${id}`),
  createLiveTvSeriesTimer: async () => {
    throw new Error('blocked')
  },
  getLiveTvSeriesTimer: async () => {
    throw new Error('blocked')
  },
  updateLiveTvSeriesTimer: async () => calls.push('update'),
}
const ticks = []
const states = []
const r = createLiveRecording({
  api: () => api,
  program: () => program,
  onChange: (s) => states.push(s),
  toast: (m) => toasts.push(m),
  onChanged: () => changed++,
  now: () => NOW,
  every: (fn) => (ticks.push(fn), ticks.length),
  stopEvery: (h) => (ticks[h - 1] = null),
  after: () => 1,
  cancelAfter: () => {},
})
const settle = () => new Promise((res) => setTimeout(res, 0))
r.sync(true)
await settle()
assert.deepEqual(calls, ['program p1', 'timers'])
assert.equal(ticks.length, 1)
r.sync(true)
assert.equal(ticks.length, 1, 'same program, same ticker')
timers = [timer('InProgress')]
ticks[0]()
await settle()
assert.equal(r.state().mark, 'record')
r.sync(false)
assert.equal(ticks[0], null, 'stops with the controls away')

// Actions: a refused create says so, a cancel toasts and tells the carousel.
await r.record({ prompt: async () => 'now', setLoading: () => {}, channel: '7 Disney' })
assert.equal(toasts.pop(), 'Unable to create recording')
assert.equal(changed, 0)
await r.cancel()
assert.equal(toasts.pop(), 'Recording cancelled')
assert.equal(changed, 1)
assert.ok(calls.includes('cancel t-InProgress'))
await r.recordSeries('all')
assert.equal(toasts.pop(), 'Unable to create series recording')
program = prog({ SeriesTimerId: 's1' })
r.sync(true)
assert.equal(await r.loadSeriesRule(), null)
assert.equal(toasts.pop(), 'Unable to update series recording')
r.updateSeries({ Id: 's1', SkipEpisodesInLibrary: true }, 'notRecorded')
await settle()
assert.ok(!calls.includes('update'), 'an unchanged choice sends nothing')

// prepare answers false and toasts when the fetch fails.
api.getLiveTvTimers = async () => {
  throw new Error('offline')
}
assert.equal(await r.prepare(), false)
assert.equal(toasts.pop(), 'Failed to load recordings')
r.dispose()
console.log('liveRecording ok')
