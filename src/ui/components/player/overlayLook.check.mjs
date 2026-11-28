// The skip, Next Up and Still Watching prompts take the theme's colors.
//   node --conditions=browser src/ui/components/player/overlayLook.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { accentButtonFocus, panelFill } = await import('./overlayLook.js')

const hero = { surface: '#333c57ff', accent: '#ef7d57ff', onAccent: '#1a1c2cff', focus: '#ffcd75ff' }
const glass = { surface: '#0e1117d9', accent: '#0a84ffff', onAccent: '#ffffffff', focus: '#ffffffff' }

// The panel is the theme's surface, more opaque on the tiers that strip the blur.
assert.equal(panelFill(hero, 'high'), '#333c57e0')
assert.equal(panelFill(glass, 'low'), '#0e1117f7')

// Play Next and Continue ring in the focus color where it shows on the accent, and in their ink where it
// barely does, like 8-Bit Hero's gold on its orange or the Moonfin cyan Focus Color on Glass's blue.
assert.equal(accentButtonFocus({ ...hero, focus: '#000080ff' }), '#000080ff')
assert.equal(accentButtonFocus(hero), '#1a1c2cff')
assert.equal(accentButtonFocus({ ...glass, focus: '#00a4dcff' }), '#ffffffff')
assert.equal(accentButtonFocus({ ...glass, accent: '#00a4dcff', focus: '#00a4dcff' }), '#ffffffff')

console.log('overlayLook ok')
