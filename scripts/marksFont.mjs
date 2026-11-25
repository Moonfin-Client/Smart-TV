// Writes public/fonts/MoonfinMarks.otf: the modifier letters channel names use ("ᴴᴰ", "ᴸᶦᵍᵃ Eᶜᵘᵃᵈᵒʳ"),
// U+02B0 to U+02B8, U+1D2C to U+1D6A and U+1D9B to U+1DBF, cut from Noto Sans Regular (OFL, the
// project's NotoSans-OFL.txt). webOS 3's only face with them is a serif (ui/fonts.js moonfin-marks).
//   node scripts/marksFont.mjs <NotoSans-Regular.ttf or NotoSans[wght].ttf>
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ot = require('opentype.js')
const font = ot.parse(readFileSync(process.argv[2]).buffer)
const glyphs = [new ot.Glyph({ name: '.notdef', unicode: 0, advanceWidth: font.unitsPerEm / 2, path: new ot.Path() })]
for (const [lo, hi] of [[0x2b0, 0x2b8], [0x1d2c, 0x1d6a], [0x1d9b, 0x1dbf]]) {
  for (let c = lo; c <= hi; c++) {
    const i = font.charToGlyphIndex(String.fromCodePoint(c))
    if (!i) continue
    const g = font.glyphs.get(i)
    const path = g.getPath(0, 0, font.unitsPerEm)
    // getPath draws with y down, and a glyph's outline is in font units with y up.
    for (const cmd of path.commands) for (const k of ['y', 'y1', 'y2']) if (k in cmd) cmd[k] = -cmd[k]
    glyphs.push(new ot.Glyph({ name: 'uni' + c.toString(16).toUpperCase(), unicode: c, advanceWidth: g.advanceWidth, path }))
  }
}
const out = fileURLToPath(new URL('../public/fonts/MoonfinMarks.otf', import.meta.url))
const cut = new ot.Font({ familyName: 'Moonfin Marks', styleName: 'Regular', unitsPerEm: font.unitsPerEm, ascender: font.ascender, descender: font.descender, glyphs })
writeFileSync(out, Buffer.from(cut.toArrayBuffer()))
console.log(`[marksFont] ${glyphs.length - 1} glyphs, ${readFileSync(out).length} bytes`)
