// Generates the MSDF atlas (<name>.msdf.json and .msdf.webp) for every TTF in public/fonts that has a
// <name>.config.json, and writes the configs from src/ui/msdfChars.js first: one 1024 page with the
// charset the app's text checks against (ui/text.js). Run it after adding a font or changing the
// charset. The atlases are checked in, so a build doesn't need it. It also writes src/ui/msdfGaps.js,
// the charset glyphs each face lacks (its atlas holds a box for them), so ui/text.js draws a string
// holding one with canvas text instead, which takes the glyph from a fallback face as Chrome does.
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, readdirSync, existsSync, statSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import opentype from 'opentype.js'
import { genFont, setGeneratePaths } from '@lightningjs/msdf-generator'
import { adjustFont } from '@lightningjs/msdf-generator/adjustFont'
import { MSDF_CHARS } from '../src/ui/msdfChars.js'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../public/fonts/', import.meta.url))
const gapsFile = fileURLToPath(new URL('../src/ui/msdfGaps.js', import.meta.url))
const force = process.argv.includes('--force')
const mtime = (f) => (existsSync(f) ? statSync(f).mtimeMs : 0)
// Glyphs a face's atlas holds beyond the charset. Chrome sets "fi" and "fl" in Press Start 2P as its
// one-cell ligatures, so the renderer swaps those pairs for U+FB01 and U+FB02 where the atlas has
// them (scripts/patch-renderer.mjs, fi and fl ligatures).
const EXTRA = { 'PressStart2P-Regular': 'ﬁﬂ' }
const hasAll = (json, chars) => {
  if (!existsSync(json)) return false
  const ids = {}
  JSON.parse(readFileSync(json, 'utf8')).chars.forEach((c) => (ids[c.id] = true))
  for (let i = 0; i < chars.length; i++) if (!ids[chars.charCodeAt(i)]) return false
  return true
}

const gaps = {}
for (const f of readdirSync(dir).filter((n) => n.endsWith('.ttf'))) {
  const base = f.replace(/\.ttf$/, '')
  const cfg = join(dir, `${base}.config.json`)
  if (!existsSync(cfg)) continue
  const charset = MSDF_CHARS + (EXTRA[base] || '')
  const buf = readFileSync(join(dir, f))
  const face = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const lacks = MSDF_CHARS.split('').filter((c) => c !== ' ' && face.charToGlyphIndex(c) === 0).join('')
  if (lacks) gaps[base] = lacks
  writeFileSync(cfg, JSON.stringify({ charset, textureSize: 1024 }))
  const json = join(dir, `${base}.msdf.json`)
  if (!force && mtime(json) > mtime(join(dir, f)) && hasAll(json, charset)) continue
  const tmp = mkdtempSync(join(tmpdir(), 'msdf-'))
  setGeneratePaths(dir, tmp, cfg)
  const info = await genFont(f, 'msdf')
  if (!info) throw new Error(`MSDF generation failed for ${f}`)
  await adjustFont(info)
  copyFileSync(info.jsonPath, json)
  execFileSync('magick', [info.pngPath, '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', join(dir, `${base}.msdf.webp`)])
  rmSync(tmp, { recursive: true, force: true })
  console.log(`atlas for ${base}`)
}

writeFileSync(
  gapsFile,
  `// Written by scripts/fonts.mjs: the charset glyphs (src/ui/msdfChars.js) each face's TTF lacks, by file.\nexport const MSDF_GAPS = ${JSON.stringify(gaps, null, 2)}\n`
)
