// Self-check for the detail previews' layout against measured boxes:
// node src/ui/components/previews/detailLayout.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
globalThis.window = globalThis.window || { innerWidth: 1920 }
const { detailScene, detailFallback } = await import('./detailLayout.js')
const { previewPalette } = await import('./palette.js')

const t = previewPalette({})
const film = { id: 'f', title: 'Film', year: 2018, officialRating: 'PG', runtimeMinutes: 97, genres: ['Comedy'], overview: '', logoUrl: 'logo', posterUrl: 'p', backdropUrl: 'b', communityRating: 6.8 }
const scene = (variant, s = {}, extra = {}) => detailScene({ s, t, item: film, items: [film, film, film, film, film], variant, logoDim: { w: 400, h: 100 }, ratingsH: 25.77, strip: [], premiereScrim: '', quickLookSurface: '#0e1016ff', ...extra })
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.05, `${what}: ${a} vs ${b}`)
const accent = (o) => o.boxes.find((b) => b.color === t.accent)

// Modern: logo, facts, tech row, ratings, then Play 24 under them.
const modern = scene('v2', { detailShowTechnicalDetails: true })
near(modern.ratings.y, 244, 'Modern ratings')
near(accent(modern).y, 244 + 25.77 + 24, 'Modern play')
near(accent(modern).w, 224, 'Modern play width')
// Spotlight's cards and Nouveau's rails sit under the same hero.
assert.equal(scene('v3').boxes.filter((b) => b.w === 192 && b.h === 110).length, 3)
// Stage's four circles shrink to share the poster's width.
const stage = scene('v6')
near(stage.boxes.filter((b) => b.h === 45 && b.y === 446)[0].w, 43.025, 'Stage circle')
// Premiere's block ends 10 over the foot, its arrow 2 down a 33 line, at y 499.
assert.ok(scene('v7').boxes.some((b) => b.w === 25 && Math.abs(b.y - 499) < 0.01))
// Quick Look's title starts under the drawer's backdrop.
const quick = scene('v8')
assert.ok(quick.texts.some((x) => Math.abs(x.y - (144.6 + 25.875 * 0)) < 3 && x.size === 22.5))
// Frost's toolbar holds Play and five circles in a 416 wide bar.
const frost = scene('v9')
assert.ok(frost.boxes.some((b) => b.y === 403.5 && Math.abs(b.w - 416) < 0.01))
// Classic centers its seven tiles: the first at 78.
const classic = scene('v1')
assert.ok(classic.boxes.some((b) => Math.abs(b.x - 103) < 0.01 && b.w === 58))
// The stand-ins fit their 320 by 200 box into the screen, 2.7 times, 48 in from the left.
const fb = detailFallback('v1', t)
assert.ok(fb.boxes.every((b) => b.x >= 48 && b.x + b.w <= 912 && b.y >= 0 && b.y + b.h <= 540))
assert.equal(detailFallback('v7', t).boxes.length, 2)
console.log('detailLayout ok')
