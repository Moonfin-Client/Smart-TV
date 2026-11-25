// Pictures the player's overlays draw once on a canvas and reuse as textures: CountdownRing's ring
// and half ring, and the channel carousel card's genre bar mask.

const rings = {}

// A white ring (or its right half) of `stroke` width inside a `size` square, keyed by its shape.
export const ringSrc = (size, stroke, half) => {
  const key = `${size}:${stroke}:${half ? 'h' : 'f'}`
  if (!rings[key]) {
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const g = c.getContext('2d')
    g.strokeStyle = '#ffffff'
    g.lineWidth = stroke
    g.beginPath()
    g.arc(size / 2, size / 2, (size - stroke) / 2, -Math.PI / 2, half ? Math.PI / 2 : 1.5 * Math.PI)
    g.stroke()
    rings[key] = c.toDataURL('image/png')
  }
  return rings[key]
}

const masks = {}

// The card's rounded left edge cut 6px wide for the genre bar. It's a white mask the bar's color
// tints, drawn once per border radius, so no card needs a clip.
export const barMask = (r, h) => {
  const key = `${r}|${h}`
  if (masks[key] != null) return masks[key]
  let url = ''
  try {
    const c = document.createElement('canvas')
    c.width = 6
    c.height = Math.round(h)
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(0, r)
    g.arcTo(0, 0, r, 0, r)
    g.lineTo(30, 0)
    g.lineTo(30, h)
    g.lineTo(r, h)
    g.arcTo(0, h, 0, h - r, r)
    g.closePath()
    g.fill()
    url = c.toDataURL()
  } catch (e) {
    // Without a canvas the card has no bar.
  }
  masks[key] = url
  return url
}
