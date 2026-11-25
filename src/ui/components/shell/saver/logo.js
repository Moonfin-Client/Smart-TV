// Reading back what utils/logoAutocrop.js decided for a logo, so the renderer can draw the same crop.

// Where the ink sits in the full logo, read back from autocrop's background style. A trim padded
// past the image's own edge spans more than 1 and still has its offset.
export const logoCrop = (r) => {
  const st = r && r.style
  if (!st || !st.backgroundSize) return null
  const size = String(st.backgroundSize).split(' ').map(parseFloat)
  const pos = String(st.backgroundPosition).split(' ').map(parseFloat)
  const at = (p, span) => (span === 1 ? 0 : (p / 100) * (1 - span))
  const across = 100 / size[0]
  const down = 100 / size[1]
  return { left: at(pos[0], across), across, top: at(pos[1], down), down }
}

// The trimmed size autocrop gives its transparent stand-in image.
export const sizerDims = (url) => {
  const m = /width%3D%22(\d+)%22%20height%3D%22(\d+)%22/.exec(url || '')
  return m ? { w: +m[1], h: +m[2] } : null
}
