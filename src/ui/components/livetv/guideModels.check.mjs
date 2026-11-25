// Self-check for guideModels.js and livetvPopups.js: node src/ui/components/livetv/guideModels.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx)
  },
})
const { PX, ROW_H, cellModels, layoutActions, popupModel, rgba, collapse } = await import('./guideModels.js')
const { sortPopup, programPopup } = await import('./livetvPopups.js')

assert.equal(ROW_H, 87)
// The window spans three hours across the 1553 wide program area.
assert.equal(Math.round(PX * 30 * 60000 * 10) / 10, 258.8)
assert.equal(rgba('0, 164, 220', 0.14), '#00a4dc24')
assert.equal(collapse('Mon  8:00 AM –  9:00 AM'), 'Mon 8:00 AM – 9:00 AM')

const ws = Date.UTC(2026, 10, 23, 15, 0)
const prog = (start, mins, extra = {}) => ({ Id: `p${start}`, Name: 'Show', StartDate: new Date(start).toISOString(), EndDate: new Date(start + mins * 60000).toISOString(), ...extra })
const now = ws + 10 * 60000
const cell = (p, kind = 'program') => ({ kind, start: Math.max(ws, Date.parse(p.StartDate)), end: Date.parse(p.EndDate), program: p })
// Started before the window: the continues arrow, a live progress bar, the accent tint.
const [live] = cellModels([cell(prog(ws - 30 * 60000, 60))], ws, now, 'No program data')
assert.equal(live.marker.length, 1)
assert.equal(live.progress.length, 1)
assert.equal(live.bg, '#00a4dc24')
assert.equal(live.title[0].lines, 2)
// An episode line takes the second line, so the title stays on one.
const [ep] = cellModels([cell(prog(ws + 60 * 60000, 60, { EpisodeTitle: 'Pilot' }))], ws, now, 'No program data')
assert.equal(ep.meta.length, 1)
assert.equal(ep.title[0].lines, 1)
assert.equal(ep.live, false)
// A gap centers its label, a loading row shows only the spinner.
const [gap] = cellModels([{ kind: 'gap', start: ws, end: ws + 3 * 3600000, program: null }], ws, now, 'No program data')
assert.equal(gap.title[0].text, 'No program data')
const [loading] = cellModels([{ kind: 'loading', start: ws, end: ws + 3 * 3600000, program: null }], ws, now, '')
assert.equal(loading.spin.length, 1)
assert.equal(loading.bar.length, 0)

// Actions right align and wrap onto a second row once the first is full.
const acts = layoutActions([{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }], 888)
assert.equal(acts.buttons.length, 2)
const last = acts.buttons[1]
assert.equal(Math.round(last.x + last.w), 888)
const many = layoutActions(Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, label: 'Cancel Series Recording' })), 888)
assert.ok(many.buttons[many.buttons.length - 1].row > 0)

// A long list is capped at 80% of the screen and scrolls inside.
const tall = popupModel({ width: 960, title: 'T', options: [], body: () => 22 * 69 })
assert.equal(tall.h, 864 + 72)
assert.equal(tall.w, 960 + 72)
assert.ok(tall.listH < 22 * 69)
// A restyled title (Recordings' Neon Pulse dialogs) keeps its place and takes the style's face and look.
const glow = { color: '#ff2e9259', x: 0, y: 0, blur: 8 }
const styled = popupModel({ width: 700, title: 'Cancel Recording?', titleStyle: { measure: 'bold', font: () => 'neon', color: '#ff2e92', spacing: 0.4, shadow: glow } })
assert.deepEqual([styled.texts[0].font, styled.texts[0].color, styled.texts[0].spacing, styled.texts[0].shadow], ['neon', '#ff2e92', 0.4, glow])
assert.equal(styled.texts[0].y, popupModel({ width: 700, title: 'Cancel Recording?' }).texts[0].y)
assert.equal(popupModel({ width: 700, title: 'T' }).texts[0].spacing, 0)

const sort = sortPopup('name')
assert.equal(sort.focus, 'name')
assert.equal(sort.options.length, 3)
const p = prog(ws - 30 * 60000, 60, { ChannelId: 'c', IsSeries: true, TimerId: 't' })
const pop = programPopup({ program: p, channel: { UserData: { IsFavorite: true } }, now, clockDisplay: '12-hour' })
assert.deepEqual(pop.buttons.map((b) => b.id), ['record', 'series', 'favorite', 'watch', 'close'])
// Recording now, so Cancel Recording is where focus lands.
assert.equal(pop.focus, 'record')
assert.equal(pop.buttons[0].label, 'Cancel Recording')
console.log('guideModels ok')
