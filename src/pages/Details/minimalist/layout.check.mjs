// Self-check for Minimalist's layout: node src/pages/Details/minimalist/layout.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The details measure through ui/text.js, whose imports lean on Vite for imports without an
// extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { layoutMinimalist, logoBox, minimalistLeft } = await import('./layout.js')

const near = (a, b) => assert.ok(Math.abs(a - b) <= 1, `${a} vs ${b}`)

// The Bourne Legacy: a 340x31 logo over the buttons, nothing under them.
let l = layoutMinimalist({ left: minimalistLeft('rail'), episodesH: 0, logo: logoBox(400, 36.5), still: false })
near(l.logo.y, 904)
near(l.actionsY, 961)
// INVINCIBLE: season tabs (63 + 18) over a rail of 20 + 203 + 20.
l = layoutMinimalist({ left: 176, episodesH: 324, logo: logoBox(340, 109), still: false })
near(l.episodesY, 712)
near(l.actionsY, 603)
near(l.logo.y, 469)
// An episode: its name under the logo and its still beside the headline.
l = layoutMinimalist({ left: 176, episodesH: 324, logo: logoBox(340, 109), episodeName: 'HERE GOES NOTHING', still: true })
near(l.episodeName.y, 542)
near(l.logo.y, 419)
near(l.still.x, 984)
near(l.still.y, 431)
near(l.still.w, 440)
// A logo is only ever scaled down.
assert.deepEqual(logoBox(200, 50), { w: 200, h: 50 })
assert.equal(logoBox(680, 200).w, 340)
console.log('layout ok')
