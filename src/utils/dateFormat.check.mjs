import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
const STUBS = {
  i18n: stub('export default (s) => s; export const currentLocale = () => "en-US"'),
  uiLocale: stub('export const uiLocale = () => "en-US"'),
}
registerHooks({
  resolve(spec, ctx, next) {
    const m = /\/(services\/i18n|uiLocale)(\.js)?$/.exec(spec)
    if (m) return { url: STUBS[m[1].split('/').pop()], shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})

const { formatMediumDate, formatDetailReleaseDate } = await import('./dateFormat.js')

const sample = new Date(Date.UTC(2026, 10, 19, 0, 0, 0))
assert.equal(formatMediumDate(sample, 'monthDay', { utc: true }), 'Nov 19, 2026')
assert.equal(formatMediumDate(sample, 'dayMonth', { utc: true }), '19 Nov 2026')
assert.match(formatMediumDate(sample, 'system', { utc: true }), /2026/)

// Off -> year only
assert.equal(
  formatDetailReleaseDate({ ProductionYear: 2024, PremiereDate: '2024-03-15T00:00:00.0000000Z' }, { showFullDate: false, dateFormat: 'monthDay' }),
  '2024',
)

// On -> full date in UTC (no backward shift west of UTC)
assert.equal(
  formatDetailReleaseDate({ ProductionYear: 2024, PremiereDate: '2024-03-15T00:00:00.0000000Z' }, { showFullDate: true, dateFormat: 'monthDay' }),
  'Mar 15, 2024',
)
assert.equal(
  formatDetailReleaseDate({ ProductionYear: 2024, PremiereDate: '2024-03-15T00:00:00.0000000Z' }, { showFullDate: true, dateFormat: 'dayMonth' }),
  '15 Mar 2024',
)

// Missing or invalid PremiereDate falls back to ProductionYear
assert.equal(formatDetailReleaseDate({ ProductionYear: 1999 }, { showFullDate: true, dateFormat: 'monthDay' }), '1999')
assert.equal(formatDetailReleaseDate({ ProductionYear: 1999, PremiereDate: 'not-a-date' }, { showFullDate: true, dateFormat: 'monthDay' }), '1999')
assert.equal(formatDetailReleaseDate({}, { showFullDate: true, dateFormat: 'monthDay' }), '')
