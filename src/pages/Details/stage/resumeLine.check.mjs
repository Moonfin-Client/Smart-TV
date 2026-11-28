// The resume bar beside a watched title that's being rewatched.   node --conditions=browser src/pages/Details/stage/resumeLine.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { resumeLine } = await import('./stageRules.js')

const item = (played, position) => ({ Type: 'Episode', RunTimeTicks: 15e9, UserData: { Played: played, PlaybackPositionTicks: position } })
assert.equal(Math.round(resumeLine(item(true, 6e9)).percent), 40)
assert.equal(resumeLine(item(true, 0)), null)
assert.equal(Math.round(resumeLine(item(false, 6e9)).percent), 40)

console.log('resumeLine ok')
