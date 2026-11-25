// The settings previews draw the player's seek bar in the previewed theme's range colors.
//   node --conditions=browser src/ui/components/previews/palette.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { previewPalette } = await import('./palette.js')
const { resolveThemeById } = await import('../../../theme/themeRegistry.js')

for (const id of ['moonfin', 'neon_pulse']) {
  const c = resolveThemeById(id).colors
  const t = previewPalette({ visualTheme: id })
  // The registry writes #AARRGGBB, the palette #rrggbbaa.
  const rgba = (hex) => (hex.length === 7 ? hex + 'ff' : '#' + hex.slice(3) + hex.slice(1, 3)).toLowerCase()
  assert.deepEqual([t.rangeTrack, t.rangeProgress, t.rangeThumb], [c.rangeTrack, c.rangeProgress, c.rangeThumb].map(rgba), id)
}
// Neon Pulse's bar isn't Moonfin's blue.
assert.notEqual(previewPalette({ visualTheme: 'neon_pulse' }).rangeProgress, '#00a4dcff')
// The Focus Color setting reaches the preview's focus color.
assert.equal(previewPalette({ visualTheme: 'neon_pulse', focusBorderColor: '#ff0000' }).focusBorderColor, '#ff0000ff')

console.log('palette ok')
