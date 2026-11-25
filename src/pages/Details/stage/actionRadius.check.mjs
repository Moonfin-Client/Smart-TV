// The icon buttons after Play on Stage, Premiere and Quick Look are circles, as in Core.
//   node --conditions=browser src/pages/Details/stage/actionRadius.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
registerHooks({
  resolve(spec, ctx, next) {
    if (/services\/i18n(\.js)?$/.test(spec)) return { url: stub('export default (s) => s'), shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { actionRadius } = await import('./stageRules.js')

// Stage's 86px circles and Premiere's and Quick Look's 86.8px ones take half their width.
assert.equal(actionRadius({ lead: false, w: 86, h: 86 }), 43)
assert.equal(actionRadius({ lead: false, w: 86.8, h: 86.8 }), 43.4)
// The labeled first button keeps its 38px pill.
assert.equal(actionRadius({ lead: true, w: 388, h: 86 }), 38)
assert.equal(actionRadius({ lead: true, w: 300, h: 90 }), 38)
// Pixel themes square every button off.
assert.equal(actionRadius({ lead: false, w: 86, h: 86 }, true), 0)
assert.equal(actionRadius({ lead: true, w: 388, h: 86 }, true), 0)

console.log('actionRadius ok')
