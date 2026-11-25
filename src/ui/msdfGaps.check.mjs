// node src/ui/msdfGaps.check.mjs: the gap list scripts/fonts.mjs writes names what each theme face lacks,
// so ui/text.js sends "Željko" in Neon Pulse to Rajdhani's canvas twin, and Press Start 2P's atlas holds
// the fi and fl ligatures the renderer swaps in.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MSDF_GAPS } from './msdfGaps.js'

assert.ok(MSDF_GAPS['Rajdhani-Regular'].includes('Ž'))
assert.ok(MSDF_GAPS['Rajdhani-Bold'].includes('Ž'))
assert.ok(MSDF_GAPS['Orbitron-Bold'].includes('·'))
assert.equal(MSDF_GAPS['Roboto-Regular'], undefined)
assert.ok(!MSDF_GAPS['PressStart2P-Regular'].includes('i'))
const atlas = JSON.parse(readFileSync(new URL('../../public/fonts/PressStart2P-Regular.msdf.json', import.meta.url), 'utf8'))
const ids = new Set(atlas.chars.map((c) => c.id))
assert.ok(ids.has(0xfb01) && ids.has(0xfb02))
console.log('msdfGaps ok')
