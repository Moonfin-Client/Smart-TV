// Self-check for readWindow in accessSchedule.js: node src/utils/accessSchedule.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { readWindow } = await import('./accessSchedule.js')

// Reads the plugin's answer in milliseconds, rounded up to the second.
assert.deepEqual(readWindow({ allowed: true, secondsUntilClose: 3601 }), { allowed: true, untilCloseMs: 3601000, untilOpenMs: null })
assert.deepEqual(readWindow({ allowed: false, secondsUntilOpen: 59.2 }), { allowed: false, untilCloseMs: null, untilOpenMs: 60000 })
assert.deepEqual(readWindow({ allowed: true, secondsUntilClose: null, secondsUntilOpen: null }), { allowed: true, untilCloseMs: null, untilOpenMs: null })
// Durations that aren't a count of seconds are left out.
assert.deepEqual(readWindow({ allowed: true, secondsUntilClose: -5, secondsUntilOpen: '60' }), { allowed: true, untilCloseMs: null, untilOpenMs: null })
assert.deepEqual(readWindow({ allowed: true, secondsUntilClose: Infinity }), { allowed: true, untilCloseMs: null, untilOpenMs: null })
// Anything without `allowed` isn't a window.
for (const json of [null, undefined, '<html>', {}, { allowed: 'true' }, { secondsUntilOpen: 60 }]) assert.equal(readWindow(json), null)
console.log('accessSchedule ok')
