// Blurs a backdrop the server can't blur, like a Seerr title's TMDB art. The renderer has no blur
// that wide, so the picture is drawn at a fifth of the screen's size, box blurred three times over
// (close to a Gaussian), and handed back as a data URL the page stretches. Art that won't let a
// canvas read it stays sharp.
const W = 384
const H = 216
const SHRINK = 5
// The last picture only, so a long browse doesn't pile them up.
let last = { key: '', src: '' }

// One box blur pass along each row, or each column, with the edges clamped.
const pass = (src, dst, w, h, r, along) => {
  const n = along ? w : h
  const lines = along ? h : w
  const step = along ? 4 : w * 4
  const span = 2 * r + 1
  for (let l = 0; l < lines; l++) {
    const base = along ? l * w * 4 : l * 4
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(n - 1, Math.max(0, k)) * step + c]
      for (let i = 0; i < n; i++) {
        dst[base + i * step + c] = sum / span
        sum += src[base + Math.min(n - 1, i + r + 1) * step + c] - src[base + Math.max(0, i - r) * step + c]
      }
    }
  }
}

// Three box passes each way, `r` wide, over RGBA pixels w by h.
export const boxBlur = (data, w, h, r) => {
  const tmp = new Uint8ClampedArray(data.length)
  for (let i = 0; i < 3; i++) {
    pass(data, tmp, w, h, r, true)
    pass(tmp, data, w, h, r, false)
  }
  return data
}

// Calls back with the blurred picture's data URL, or the url as it was when it can't be read.
export const softBackdrop = (url, blur, done) => {
  const key = `${blur}|${url}`
  if (last.key === key) return done(last.src)
  // TMDB serves a small size, which is all a blur this wide needs.
  const small = url.replace(/(image\.tmdb\.org\/t\/p\/)[^/]+\//, '$1w780/')
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const g = canvas.getContext('2d')
      g.drawImage(img, 0, 0, W, H)
      // The decoded picture would otherwise stay until a garbage collection takes the element.
      img.onerror = null
      img.removeAttribute('src')
      const px = g.getImageData(0, 0, W, H)
      // Three passes of width 2r + 1 come to a Gaussian of about the CSS radius at this size.
      boxBlur(px.data, W, H, Math.max(1, Math.round(blur / SHRINK)))
      g.putImageData(px, 0, 0)
      last = { key, src: canvas.toDataURL('image/jpeg', 0.9) }
    } catch (e) {
      last = { key, src: url }
    }
    done(last.src)
  }
  img.onerror = () => done(url)
  img.src = small
}
