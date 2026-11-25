// Renders the glyphs the settings and setup previews draw (src/ui/components/previews) to 64 px
// white WebP images in public/icons/preview, the way scripts/icons.mjs does. It renders every
// icons/preview/<name>.webp the preview code names, so a new one needs no list edit. The paths come
// from scripts/iconPaths.mjs: d_<key> from DETAIL, m_<key> from MATERIAL, n_<key> from NAV,
// p_<IconName> from PLAYER, and a bare <key> from SETUP, MATERIAL_SYMBOLS or Home's
// HOME_MATERIAL_ICON_PATHS in src/components/icons/homeIconPaths.js.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DETAIL, MATERIAL, MATERIAL_SYMBOLS, NAV, PLAYER, SETUP } from './iconPaths.mjs'

const home = readFileSync(new URL('../src/components/icons/homeIconPaths.js', import.meta.url), 'utf8')
const homeMaterial = {}
for (const m of home.slice(home.indexOf('HOME_MATERIAL_ICON_PATHS')).matchAll(/^\s+([a-zA-Z_0-9]+):\s*'([mM][^']+)'/gm)) {
  if (!homeMaterial[m[1]]) homeMaterial[m[1]] = m[2]
}
const grid960 = { ...homeMaterial, ...MATERIAL_SYMBOLS, ...SETUP }

const lookup = (name) => {
  if (name.startsWith('d_')) return { d: DETAIL[name.slice(2)], box: '0 -960 960 960' }
  if (name.startsWith('m_')) return { d: MATERIAL[name.slice(2)], box: '0 0 24 24' }
  if (name.startsWith('n_')) return { d: NAV[name.slice(2)], box: '0 0 24 24' }
  if (name.startsWith('p_')) return { d: PLAYER[name.slice(2)], box: '0 -960 960 960' }
  return { d: grid960[name], box: '0 -960 960 960' }
}

const src = fileURLToPath(new URL('../src/', import.meta.url))
const files = []
const walk = (dir) => readdirSync(dir).forEach((f) => {
  const p = `${dir}/${f}`
  if (statSync(p).isDirectory()) walk(p)
  else if (/\.jsx?$/.test(p)) files.push(p)
})
walk(`${src}ui/components/previews`)
files.push(`${src}pages/Shell/SetupWizard.jsx`)
const names = new Set()
files.forEach((f) => {
  for (const m of readFileSync(f, 'utf8').matchAll(/icons\/preview\/([\w-]+)\.webp/g)) names.add(m[1])
})

const out = new URL('../public/icons/preview/', import.meta.url)
mkdirSync(out, { recursive: true })
const missing = []
for (const name of names) {
  const { d, box } = lookup(name)
  if (!d) {
    missing.push(name)
    continue
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="${box}"><path fill="#ffffff" d="${d}"/></svg>`
  writeFileSync(new URL(`${name}.webp`, out), execFileSync('magick', ['-background', 'none', '-density', '384', 'svg:-', '-resize', '64x64', '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', 'webp:-'], { input: svg }))
}
console.log(`rendered ${names.size - missing.length} preview icons${missing.length ? `, missing: ${missing.join(', ')}` : ''}`)
