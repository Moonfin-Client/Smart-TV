// Self-check for the Incomplete line and the anime marker pills: node src/pages/Details/detailMarks.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
const STUBS = {
  'ui/text': stub("export const cssShift = (s) => Math.round(0.0918 * s * 2) / 2; export const fontFor = () => 'roboto'"),
  'services/incompleteRecordings': stub('export const incompleteRecordingFor = () => null'),
  'services/animeMarkersApi': stub("export const animeLabelStyle = () => 'full'; export const areAnimeMarkersEnabled = () => true; export const audioForItem = () => null; export const fetchItemMarkers = async () => ({}); export const fetchSeriesMarkers = async () => null; export const markerForEpisode = () => null"),
  'utils/clock': stub("export const formatShowingTime = () => 'Thu 8:00 PM'"),
}
registerHooks({
  resolve(spec, ctx, next) {
    const m = /\/(ui\/text|services\/incompleteRecordings|services\/animeMarkersApi|utils\/clock)(\.js)?$/.exec(spec)
    if (m) return { url: STUBS[m[1]], shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { incompleteText, drawAnimePills } = await import('./detailMarks.js')

// The line's three outcomes, and a malformed count read as zero.
const base = { recordedMinutes: 23.4, expectedMinutes: '37' }
assert.equal(incompleteText(null), '')
assert.equal(incompleteText({ ...base, state: 'scheduled', scheduledStart: '2026-11-26T20:00:00Z' }), 'Incomplete · 23 of 37 min · Complete showing scheduled Thu 8:00 PM')
assert.equal(incompleteText({ ...base, state: 'notFound' }), 'Incomplete · 23 of 37 min · No complete showing found')
assert.equal(incompleteText({ state: 'pending', recordedMinutes: 'x', expectedMinutes: 5 }), 'Incomplete · 0 of 5 min')

// The pills go kind, recap, audio, 8px apart, at the size asked for.
const out = { rects: [], texts: [] }
const row = drawAnimePills(out, 'a', { kind: 'Filler', recap: true }, 'Dubbed', 100, 50, 'large')
assert.deepEqual(out.texts.map((t) => t.text), ['Filler', 'Recap', 'Dubbed'])
assert.equal(row.h, 36.5)
assert.equal(out.rects[1].x, 100 + out.rects[0].w + 8)
assert.equal(drawAnimePills({ rects: [], texts: [] }, 'b', null, null, 0, 0).h, 0)
assert.equal(drawAnimePills({ rects: [], texts: [] }, 'c', { kind: 'Mixed' }, null, 0, 0, 'compact').h, 13 * 1.5 + 2 + 2)

console.log('detailMarks ok')
