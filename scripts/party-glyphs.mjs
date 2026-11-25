// Renders the Watch Party glyphs to WebP images in public/party: the six reactions in their own colors and
// the toast icons as white strokes the renderer can tint.
// Chrome 38 can't draw SVG textures, so they ship as WebP like public/icons. Run: node scripts/party-glyphs.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const REACTIONS = {
  love: '<path d="M12 21s-7.6-4.7-9.7-9.3C.8 8.3 2.9 4.4 6.8 4.4c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.9 0 6 3.9 4.5 7.3C19.6 16.3 12 21 12 21z" fill="#ff5c7c"/>',
  haha: '<circle cx="12" cy="12" r="10" fill="#ffc93c"/><path d="M7.4 9.8q1.3-1.6 2.6 0M14 9.8q1.3-1.6 2.6 0" stroke="#4a3300" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M6.8 13h10.4a5.2 5.2 0 0 1-10.4 0z" fill="#4a3300"/>',
  wow: '<circle cx="12" cy="12" r="10" fill="#ffc93c"/><circle cx="8.8" cy="9.8" r="1.4" fill="#4a3300"/><circle cx="15.2" cy="9.8" r="1.4" fill="#4a3300"/><ellipse cx="12" cy="15.6" rx="2.3" ry="2.9" fill="#4a3300"/>',
  sad: '<circle cx="12" cy="12" r="10" fill="#ffc93c"/><circle cx="8.8" cy="10" r="1.4" fill="#4a3300"/><circle cx="15.2" cy="10" r="1.4" fill="#4a3300"/><path d="M8.4 17q3.6-3.2 7.2 0" stroke="#4a3300" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M16.8 12.2s1.5 1.9 1.5 2.9a1.5 1.5 0 0 1-3 0c0-1 1.5-2.9 1.5-2.9z" fill="#4fb0ff"/>',
  fire: '<path d="M12 1.8c1 3.6 5.4 5.6 5.4 11.4a5.4 5.4 0 0 1-10.8 0c0-2.6 1.3-4.2 2.5-5.2.2 1.8 1.1 2.8 2.1 3.3C10.9 8.4 11.4 4.9 12 1.8z" fill="#ff7a29"/><path d="M12 12.2c.6 1.5 2.4 2.5 2.4 4.5a2.4 2.4 0 0 1-4.8 0c0-1.3.8-2.1 1.5-2.7.1.7.4 1.1.9 1.3-.3-1.1-.2-2.1 0-3.1z" fill="#ffd23c"/>',
  popcorn: '<circle cx="7.6" cy="9.4" r="2.6" fill="#ffe9a8"/><circle cx="12" cy="7.6" r="3" fill="#fff2c9"/><circle cx="16.4" cy="9.4" r="2.6" fill="#ffe9a8"/><circle cx="10" cy="5.4" r="2.1" fill="#ffe9a8"/><circle cx="14.2" cy="5.6" r="2.1" fill="#fff2c9"/><path d="M5.6 10.4h12.8l-1.7 11H7.3z" fill="#f2f2f2"/><path d="M9.2 10.4l.6 11M12 10.4v11M14.8 10.4l-.6 11" stroke="#e5484d" stroke-width="1.7"/>',
}

const ICONS = {
  crown: '<path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9z"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.6.2 4.4 1.9 5 4.8"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
  blocked: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
}

const out = new URL('../public/party/', import.meta.url)
mkdirSync(out, { recursive: true })
const render = (name, body, size) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`
  const image = execFileSync('magick', ['-background', 'none', '-density', '576', 'svg:-', '-resize', `${size}x${size}`, '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', 'webp:-'], { input: svg })
  writeFileSync(new URL(`${name}.webp`, out), image)
}
for (const [name, body] of Object.entries(REACTIONS)) render(name, body, 96)
for (const [name, body] of Object.entries(ICONS)) {
  render(name, `<g fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</g>`, 64)
}
// The wait card's pending face: a 3px dashed border around a 44px avatar, as Chrome dashes it, 50px across.
const ring = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 50 50"><circle cx="25" cy="25" r="23.5" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="9.23 9.23"/></svg>'
writeFileSync(new URL('dashring.webp', out), execFileSync('magick', ['-background', 'none', '-density', '192', 'svg:-', '-resize', '100x100', '-define', 'webp:lossless=true', '-define', 'webp:exact=true', '-define', 'webp:method=6', 'webp:-'], { input: ring }))
console.log(`rendered ${Object.keys(REACTIONS).length + Object.keys(ICONS).length} party glyphs`)
