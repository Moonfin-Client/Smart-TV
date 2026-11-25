// Layout math for the MakD bar and the ratings row, with no imports so its check runs in node.

const MAX_DOTS = 5

// At most five dots. With more titles than that, a dot stands for a share of the run.
export const activeDotIndex = (index, total) =>
  total <= MAX_DOTS ? index : Math.min(MAX_DOTS - 1, Math.floor((index / total) * MAX_DOTS))

// A wrapping row with its items centered on each line: every item has colGap / 2 on each side and
// rowGap under it, which the container takes back on its edges. An item can carry its own margins
// (ml, mr, mb), as a zoomed one does. Items get x and y inside the row's content box.
export const flowWrap = (items, maxW, colGap, rowGap) => {
  const half = colGap / 2
  const room = maxW + colGap
  const lines = []
  let line = null
  items.forEach((it) => {
    const ml = it.ml != null ? it.ml : half
    const mr = it.mr != null ? it.mr : half
    const ow = ml + it.w + mr
    const oh = it.h + (it.mb != null ? it.mb : rowGap)
    if (!line || (line.items.length && line.w + ow > room + 0.01)) {
      line = { items: [], w: 0, h: 0 }
      lines.push(line)
    }
    line.items.push({ it, ml, ow, oh })
    line.w += ow
    line.h = Math.max(line.h, oh)
  })
  const out = []
  let y = 0
  let w = 0
  lines.forEach((l) => {
    let x = -half
    l.items.forEach((p) => {
      out.push(Object.assign({}, p.it, { x: x + p.ml, y: y + (l.h - p.oh) / 2 }))
      x += p.ow
    })
    y += l.h
    w = Math.max(w, l.w - colGap)
  })
  return { items: out, w: Math.max(0, w), h: Math.max(0, y - rowGap), lines: lines.length }
}

// An image draws at its own size, or shrinks to fit its box.
export const fitImage = (natW, natH, boxW, boxH) => {
  if (!natW || !natH) return { w: 0, h: 0 }
  const s = Math.min(1, boxW / natW, boxH / natH)
  return { w: natW * s, h: natH * s }
}

// A value that runs straight between [position, value] stops and holds past either end.
const ramp = (t, stops) => {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    if (t <= b[0]) return a[1] + ((t - a[0]) / (b[0] - a[0])) * (b[1] - a[1])
  }
  return stops[stops.length - 1][1]
}

const WASH = (130 * Math.PI) / 180
const WASH_X = Math.sin(WASH)
const WASH_Y = -Math.cos(WASH)
const WASH_LEN = Math.abs(1920 * WASH_X) + Math.abs(1080 * WASH_Y)

// The MakD shade and 130 degree wash, each masked into the page over the bottom 8% of the screen, as
// one W x H picture to lay over the art. The blend is k * art + c for each pixel, so the picture's
// alpha is 1 - k and its color c. Writes RGBA bytes into out.
export const makdOverlay = (out, W, H, tint, opacity, page) => {
  const shade = Math.min(1, opacity * 0.4)
  const wash = [[0.1, Math.min(1, opacity * 1.3)], [0.3, Math.min(1, opacity * 0.7)], [1, 0]]
  const fade = [[0.02, 0], [0.06, 0.5], [0.08, 1]]
  for (let y = 0; y < H; y++) {
    const py = ((y + 0.5) * 1080) / H
    const m = ramp((1080 - py) / 1080, fade)
    for (let x = 0; x < W; x++) {
      const px = ((x + 0.5) * 1920) / W
      const t = ((px - 960) * WASH_X + (py - 540) * WASH_Y) / WASH_LEN + 0.5
      const w = ramp(t, wash) * m
      const s = shade * m
      const a = 1 - (1 - w) * (1 - s) * m
      const i = (y * W + x) * 4
      for (let c = 0; c < 3; c++) {
        const color = w * tint[c] + (1 - w) * s * tint[c] + (1 - w) * (1 - s) * (1 - m) * page[c]
        out[i + c] = Math.round(a > 0 ? color / a : 0)
      }
      out[i + 3] = Math.round(a * 255)
    }
  }
  return out
}
