// Self-check that the Seerr dialog bodies draw in the theme's colors, not white and Moonfin blue:
// node src/ui/components/seerr/dialogTheme.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { advancedLayout, manageDialog, reportDialog, requestDialog } = await import('./SeerrDialogLayout.js')
const { alphaHex } = await import('../../themeColor.js')

// Neon Pulse's colors: cyan text, pink accent, so white or blue anywhere is a fixed color.
const CYAN = '#00e5ff'
const PINK = '#ff2e92'
const t = {
  surface: '#1e0a3fcc', onSurface: CYAN + 'ff', os: (a) => CYAN + alphaHex(a),
  accent: PINK + 'ff', accentA: (a) => PINK + alphaHex(a), onAccent: '#000000ff', focus: '#ffd400ff',
  navFocusFill: CYAN + 'ff', navFocusInk: '#000000eb', inputBackground: '#2a0f52ff',
  status: { available: '#39ff14ff' }, fontFamily: 'roboto',
}
const WHITE = /^#ffffff/i
const BLUE = /^#(00a4dc|8ec8f0)/i
const colorsOf = (d) => [
  ...d.texts.concat(d.spaced).map((x) => ['text ' + x.t, x.color]),
  ...d.icons.map((x) => ['icon ' + x.src, x.color]),
  ...d.rects.map((x) => ['rect', x.color]),
  ...d.rects.filter((x) => x.bw).map((x) => ['edge', x.bc]),
].filter(([, c]) => c)
// The primary buttons keep white on their own green or indigo fill.
const OWN_FILL = new Set(['text Submit Request', 'text Submit Report', 'text Approve', 'icon icons/checkCircleOutline.webp'])
const textOf = (d, str) => d.texts.concat(d.spaced).find((x) => x.t === str)
const noFixed = (name, d) => {
  for (const [what, c] of colorsOf(d)) {
    if (OWN_FILL.has(what)) continue
    assert.ok(!WHITE.test(c), `${name}: ${what} is white (${c})`)
    assert.ok(!BLUE.test(c), `${name}: ${what} is Moonfin blue (${c})`)
  }
}

const advanced = { expanded: true, loading: false, rows: [{ key: 'server', label: 'Server', value: 'Sonarr' }] }
const chips = [{ id: 's1', label: 'Season 1', selected: true }, { id: 's2', label: 'Season 2', disabled: true }]
const req = { title: 'Request', isTv: true, toggle: true, is4k: true, allSeasons: false, chips, continuing: true, advanced, quota: { label: '3 left', blocked: false }, canSubmit: true }
for (const focusId of ['quality', 'all', 's1', 'advanced', 'adv:server', 'cancel']) {
  noFixed(`request ${focusId}`, requestDialog({ t, s: req, focusId }))
}
noFixed('advanced', advancedLayout({ t, a: { ...advanced, servers: [] }, w: 600, focusId: 'advanced' }))
noFixed('advanced empty', advancedLayout({ t, a: { expanded: true, loading: false, rows: [] }, w: 600, focusId: null }))
noFixed('manage', manageDialog({ t, requests: [{ id: 1, label: 'Asked by test4k' }], busy: false, focusId: 'decline:1' }))
const rep = { types: [{ id: 'video', label: 'Video', selected: true }, { id: 'audio', label: 'Audio' }], seasonRow: { label: 'Season', value: '1' }, episodeRow: { label: 'Episode', value: 'All' }, message: '', placeholder: 'Describe it', fieldOn: false, canSend: false }
for (const focusId of ['video', 'audio', 'season', 'message', 'cancel']) noFixed(`report ${focusId}`, reportDialog({ t, s: rep, focusId }))

// A focused row fills with the text color and writes in ink that reads on it.
const focused = reportDialog({ t, s: rep, focusId: 'audio' })
assert.ok(focused.rects.some((r) => r.color === t.navFocusFill), 'focused row fill')
assert.equal(textOf(focused, 'Audio').color, t.navFocusInk)
// A picked season writes in the accent's ink, and one already asked for stays dimmed.
const season = requestDialog({ t, s: req, focusId: 'quality' })
assert.equal(textOf(season, 'Season 1').color, t.onAccent)
assert.equal(textOf(season, 'Season 2').color, t.os(0.38))
console.log('dialog theme ok')
