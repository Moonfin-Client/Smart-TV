// Which containers get DTS offered by webOS version: LG's 2020 and 2021 sets (webOS 5 and 6) have no DTS although the
// docs list it in MKV, so there the engine's answer decides.
//   node --conditions=browser src/platform/webos/dtsSupport.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { getDtsContainerSupport } = await import('./deviceProfile.js')

const engine = (answer) => {
  globalThis.document = { createElement: () => ({ canPlayType: (type) => (/dts/.test(type) ? answer : '') }) }
}

// An LG C1 (webOS 6) answers "" for DTS: no DTS anywhere.
engine('')
for (const v of [5, 6]) assert.deepEqual(getDtsContainerSupport(v), { mkv: false, mp4: false, ts: false, avi: false }, `webOS ${v}, engine without DTS`)
// The same versions keep MKV when the engine says it plays DTS.
engine('probably')
for (const v of [5, 6]) assert.equal(getDtsContainerSupport(v).mkv, true, `webOS ${v}, engine with DTS`)
// webOS 22 and webOS 4 keep the documented support whatever the engine says.
engine('')
assert.deepEqual(getDtsContainerSupport(22), { mkv: true, mp4: false, ts: false, avi: false })
assert.deepEqual(getDtsContainerSupport(4), { mkv: true, mp4: false, ts: false, avi: true })
delete globalThis.document
console.log('dtsSupport ok')
