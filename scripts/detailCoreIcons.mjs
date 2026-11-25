// Renders the Core glyphs the Stage, Premiere, Quick Look and Frost details styles draw, from
// CORE_ICON_PATHS in src/views/Settings/settingsCoreIcons.js on their 24 grid, into
// public/icons/d/core_<name>.webp as white 96 px squares the renderer tints. Run it with
// node scripts/detailCoreIcons.mjs after the list changes.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const FILE = new URL('../src/views/Settings/settingsCoreIcons.js', import.meta.url)
const NAMES = [
  'keyboard_arrow_down', 'chevron_right', 'unfold_more', 'check_circle', 'person', 'smart_display_outlined',
  'collections_bookmark_outlined', 'format_list_bulleted', 'layers_outlined', 'people_outline', 'video_library_outlined',
  'grid_view', 'info_outline',
]
const text = readFileSync(FILE, 'utf8')
let n = 0
for (const name of NAMES) {
  const m = text.match(new RegExp(`^\\s+${name}:\\s*'([^']+)'`, 'm'))
  if (!m) throw new Error(`no path for ${name}`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><path fill="#ffffff" d="${m[1]}"/></svg>`
  const image = execFileSync('magick', ['-background', 'none', '-density', '384', 'svg:-', '-resize', '96x96', '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', 'webp:-'], { input: svg })
  writeFileSync(new URL(`../public/icons/d/core_${name}.webp`, import.meta.url), image)
  n++
}
console.log(`rendered ${n} glyphs`)
