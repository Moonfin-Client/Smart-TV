// The glyphs baked into every MSDF atlas, kept apart from text.js so scripts/fonts.mjs can read it
// in Node without the app's modules.
const range = (from, to) => {
  let out = ''
  for (let c = from; c < to; c++) out += String.fromCharCode(c)
  return out
}

// Roboto has no ★, so strings with one fall back to canvas text, which finds it in a system font.
export const MSDF_CHARS = range(0x20, 0x7f) + range(0xa0, 0x180) + '–—‘’‚“”„†•…‰‹›€™'
