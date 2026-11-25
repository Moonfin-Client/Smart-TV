// The skip, Next Up and Still Watching prompts take the theme's colors.
//   node --conditions=browser src/ui/components/player/overlayLook.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { panelFill, promptColors } = await import('./overlayLook.js')

const t = (over) => ({
  surface: '#1a0b2eff', onSurface: '#f0e6ffff', os: (a) => `os${a}`, accent: '#ff2a6dff', accentA: (a) => `accent${a}`,
  onAccentInk: '#000000eb', focus: '#05d9e8ff', ...over,
})

// The panel is the theme's surface, more opaque on the tiers that strip the blur.
assert.equal(panelFill(t(), 'high'), '#1a0b2ee0')
assert.equal(panelFill(t(), 'low'), '#1a0b2ef7')
assert.equal(panelFill(t(), 'mid'), '#1a0b2ef7')

const c = promptColors(t())
assert.equal(c.text, '#f0e6ffff')
assert.equal(c.accent, '#ff2a6dff')
assert.equal(c.onAccent, '#000000eb')
assert.equal(c.onAccentA(0.24), '#0000003d')
assert.equal(c.focus, '#05d9e8ff')
// A focus color unlike the accent rings the accent buttons as it rings everything else.
assert.equal(c.accentButtonFocus, '#05d9e8ff')
// Where the focus color is the accent itself, the accent buttons ring in their ink, so focus shows.
assert.equal(promptColors(t({ focus: '#ff2a6dff' })).accentButtonFocus, '#000000eb')

// onAccentInk keeps a readable onAccent and swaps an unreadable one for black or white.
const { theme } = await import('../../theme.js')
const live = theme()
assert.match(live.onAccentInk, /^#[0-9a-f]{8}$/)

console.log('overlayLook ok')
