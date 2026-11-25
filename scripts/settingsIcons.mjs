// Renders the settings glyphs to 64 px white WebP images in public/icons/settings: the filled Core
// path from src in a 24 box when there is one, else the outlined Material symbol from
// scripts/iconPaths.mjs in its 960 box. The names are every icon the settings schema and
// screens use.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { MATERIAL_NAMES as nameMap, MATERIAL_SYMBOLS, SETTINGS_ICON_NAMES } from './iconPaths.mjs'

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
const pathsIn = (text) => {
  const out = {}
  for (const m of text.matchAll(/^\s+([a-zA-Z_0-9]+):\s*'(M[^']+|m[^']+)'/gm)) out[m[1]] = m[2]
  return out
}
const home = pathsIn(read('components/icons/homeIconPaths.js'))
const core = { ...home, ...pathsIn(read('views/Settings/settingsCoreIcons.js')) }
const material = { ...home, ...MATERIAL_SYMBOLS }

// Every icon name the settings screens name, plus the marks the rows draw for themselves.
const names = new Set(['chevron_right', 'check_box', 'check_box_outline_blank', 'arrow_left', 'arrow_right', 'keyboard_arrow_up',
  'keyboard_arrow_down', 'lock_outline', 'search', 'check', 'refresh', 'sync', 'public', 'desktop_windows', 'smartphone', 'tv',
  'cloud_download', 'cloud_upload', 'restart_alt', 'extension', 'delete_forever', 'cleaning_services_outlined', 'system_update_alt',
  ...SETTINGS_ICON_NAMES])

const out = new URL('../public/icons/settings/', import.meta.url)
mkdirSync(out, { recursive: true })
let rendered = 0
const missing = []
for (const name of [...names].sort()) {
  const d = core[name]
  let svg
  if (d) {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><path fill="#ffffff" d="${d}"/></svg>`
  } else {
    const m = material[nameMap[name] || name]
    if (!m) {
      missing.push(name)
      continue
    }
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 -960 960 960"><path fill="#ffffff" d="${m}"/></svg>`
  }
  const file = new URL(`${name}.webp`, out)
  if (existsSync(file) && process.argv[2] !== '--force') continue
  const image = execFileSync('magick', ['-background', 'none', '-density', '384', 'svg:-', '-resize', '64x64', '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', 'webp:-'], { input: svg })
  writeFileSync(file, image)
  rendered++
}
console.log(`settings icons: ${names.size} named, ${rendered} rendered${missing.length ? `, no path for: ${missing.join(', ')}` : ''}`)
