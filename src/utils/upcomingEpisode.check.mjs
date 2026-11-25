// Self-check for the shared Sonarr calendar read: node src/utils/upcomingEpisode.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Seerr stands in for the server: the plugin route is missing and the Sonarr settings fail until told otherwise.
const calls = { calendar: 0, settings: 0 }
globalThis.__upcomingCheck = { calls, calendar: null }
const seerr = `data:text/javascript,const s = globalThis.__upcomingCheck;
export const getArrCalendar = async () => { s.calls.calendar++; return {items: s.calendar}; };
export const getSonarrSettings = async () => { s.calls.settings++; throw new Error('403'); };`
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.endsWith('/services/seerrApi')) return { url: seerr, shortCircuit: true }
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx)
  },
})
let now = Date.parse('2026-01-01T00:00:00Z')
Date.now = () => now
const { fetchUpcomingEpisode } = await import('./upcomingEpisode.js')
const series = (id) => ({ item: { Type: 'Series', Id: id, ProviderIds: { Tvdb: id } } })

// Details pages opening together share one read.
await Promise.all([fetchUpcomingEpisode(series('1')), fetchUpcomingEpisode(series('2'))])
assert.deepEqual(calls, { calendar: 1, settings: 1 })

// A failed read isn't tried again by the next page, only once the retry time has passed.
await fetchUpcomingEpisode(series('3'))
assert.deepEqual(calls, { calendar: 1, settings: 1 })
now += 5 * 60 * 1000
globalThis.__upcomingCheck.calendar = [{ series: { tvdbId: 5 }, airDateUtc: '2099-01-02T00:00:00Z', seasonNumber: 2, episodeNumber: 3 }]
const found = await fetchUpcomingEpisode(series('5'))
assert.equal(calls.calendar, 2)
assert.equal(found.episodeNumber, 3)

// A read that worked stands for half an hour.
now += 29 * 60 * 1000
await fetchUpcomingEpisode(series('6'))
assert.equal(calls.calendar, 2)
now += 60 * 1000
await fetchUpcomingEpisode(series('7'))
assert.equal(calls.calendar, 3)
console.log('upcomingEpisode ok')
