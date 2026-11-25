// Self-check for the details page's Seerr status poll: node src/ui/components/seerr/seerrPoll.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { statusKey, statusPollInterval } = await import('./seerrPoll.js')

assert.equal(statusPollInterval(null), null, 'nothing to watch')
assert.equal(statusPollInterval({ status: 5 }), null, 'in the library already')
assert.equal(statusPollInterval({ status: 3 }, { fraction: 0.4 }), 15000, 'a bar on screen moves every 15 seconds')
assert.equal(statusPollInterval({ status: 2, requests: [{ status: 1, is4k: false }] }), 30000, 'a request waiting on approval')
const media = { status: 3, status4k: 1, requests: [{ id: 1, status: 2 }], seasons: [], downloadStatus: [{ sizeLeft: 5 }] }
assert.equal(statusKey(media), statusKey({ ...media, downloadStatus: [{ sizeLeft: 1 }] }), 'progress alone keeps the overlay')
assert.notEqual(statusKey(media), statusKey({ ...media, status: 5 }), 'a status change works it out again')
assert.notEqual(statusKey(media), statusKey({ ...media, requests: [{ id: 1, status: 3 }] }))

console.log('seerrPoll ok')
