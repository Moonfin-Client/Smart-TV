// Renders the sign-in, account switcher and keyboard glyphs to white WebP images in public/icons, the
// same way scripts/icons.mjs does, from the paths in scripts/iconPaths.mjs. Outline (stroked) keyboard
// glyphs keep a 1.7 stroke on a 24 grid.
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { KEYBOARD, KEYBOARD_LINES, MATERIAL, MATERIAL_SYMBOLS, SERVER_LOGOS, SETUP } from './iconPaths.mjs'

const fill = (d, box = '0 0 24 24', wrap = (p) => p) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="${box}">${wrap(`<path fill="#ffffff" d="${d}"/>`)}</svg>`
const stroke = (d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><path fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`

const icons = {}
for (const name of ['person', 'home', 'checkRounded', 'lockOutline', 'dnsOutlined', 'addRounded', 'arrowBack', 'arrowForward', 'closeRounded', 'language', 'shield', 'error', 'checkBox', 'checkBoxBlank']) {
  icons[`acc_${name}`] = fill(MATERIAL[name])
}

icons.acc_jellyfin = fill(SERVER_LOGOS.jellyfin, '0 0 256 256')
icons.acc_plex = fill(SERVER_LOGOS.plex, '0 0 256 256')
icons.acc_silo = fill(SERVER_LOGOS.silo)
icons.acc_emby = fill(SERVER_LOGOS.emby, '0 0 712.601 712.601', (p) => `<g transform="translate(64 64) scale(0.82)">${p}</g>`)

// The keyboard's filled glyphs (Classic) and its outlined ones (Glass, Docked).
for (const [k, d] of Object.entries(KEYBOARD)) icons[`kb_${k.toLowerCase()}`] = fill(d)
for (const [k, d] of Object.entries(KEYBOARD_LINES)) icons[`kbl_${k.toLowerCase()}`] = stroke(d)

// The setup wizard's marks: Material Symbols on a 960 grid, its own few first.
const symbols = { ...SETUP }
for (const name of ['settings', 'check']) {
  if (!symbols[name] && MATERIAL_SYMBOLS[name]) symbols[name] = MATERIAL_SYMBOLS[name]
}
for (const [name, d] of Object.entries(symbols)) icons[`wiz_${name}`] = fill(d, '0 -960 960 960')
icons.acc_dnsRounded = fill(MATERIAL.dnsRounded)

// The Login spinners: a quarter of a ring with its ends cut along the diagonals, at each
// thickness the spinners draw.
const arc = (ratio) => {
  const S = 256
  const b = S * ratio
  const r = (S - b) / 2
  const at = (deg) => [S / 2 + r * Math.cos((deg * Math.PI) / 180), S / 2 + r * Math.sin((deg * Math.PI) / 180)]
  const [x0, y0] = at(-135)
  const [x1, y1] = at(-45)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" fill="none" stroke="#ffffff" stroke-width="${b}" stroke-linecap="butt"/></svg>`
}
icons.acc_arc12 = arc(2 / 24)
icons.acc_arc9 = arc(4 / 36)
icons.acc_arc7 = arc(2.5 / 18)

const out = new URL('../public/icons/', import.meta.url)
mkdirSync(out, { recursive: true })
for (const [name, svg] of Object.entries(icons)) {
  const image = execFileSync('magick', ['-background', 'none', '-density', '384', 'svg:-', '-resize', '64x64', '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', 'webp:-'], { input: svg })
  writeFileSync(new URL(`${name}.webp`, out), image)
}
console.log(`rendered ${Object.keys(icons).length} icons`)
