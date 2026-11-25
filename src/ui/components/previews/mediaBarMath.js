// The media bar previews' pure layout, importing only what runs in node so mediaBarMath.check.mjs can
// test it.
import { modernCardMetrics } from '../home/modernCardLayout.js'
import { classicCardSize, rowPeekHeight } from '../home/rowPeek.js'

// The dots: one mark per item Item Count gives the bar, up to [max], each [gap] in from
// either side, all centered on one line. The first is [active] wide (and tall, unless [pill]),
// scaled by [activeScale] around its middle. Returns the marks from the box's left and its width.
export const dotsLayout = (count, { max = Infinity, active, inactive, gap = 4, pill = false, height = null, activeScale = 1 }) => {
  const n = Math.min(count || 10, max)
  const marks = []
  let x = 0
  let rowH = 0
  for (let i = 0; i < n; i++) {
    const w = i === 0 ? active : inactive
    const h = height != null ? height : i === 0 ? (pill ? inactive : active) : inactive
    marks.push({ k: 'd' + i, x: x + gap, w, h, r: pill ? 3 : Math.min(w, h) / 2, first: i === 0 })
    x += w + gap * 2
    rowH = Math.max(rowH, h)
  }
  marks.forEach((m) => {
    m.y = (rowH - m.h) / 2
    m.scale = m.first ? activeScale : 1
  })
  return { marks, w: x, h: rowH }
}

// The box a logo's natural size fills with object-fit: contain, placed at [align]'s corner.
export const containBox = (natW, natH, boxW, boxH, align = 'bottomLeft') => {
  if (!natW || !natH) return { x: 0, y: 0, w: 0, h: 0 }
  const s = Math.min(boxW / natW, boxH / natH)
  const w = natW * s
  const h = natH * s
  const x = align === 'bottomCenter' ? (boxW - w) / 2 : 0
  const y = align === 'topLeft' ? 0 : boxH - h
  return { x, y, w, h }
}

// The poster and thumb heights Home's own cards draw at in the card size being looked at, halved for
// the half size screen.
export const rowCardHeights = (s, modern) => ({
  posterHeight: (modern ? modernCardMetrics({ posterSize: s.homeRowsPosterSize }).imageHeight : classicCardSize('portrait', s.homeRowsPosterSize).height) / 2,
  thumbHeight: classicCardSize('landscape', s.homeRowsPosterSize).height / 2,
})

// How much of Home's first [row] shows along the bottom of the bar while Peek Home Rows is on: its
// title and the top half of its cards, measured from the preview's own cards, or 0 where Home's bar
// has no peek.
export const rowPeekCover = (s, mode, row, modern) => {
  if (!rowPeekHeight({ ...s, featuredBarStyle: mode }, row)) return 0
  const { posterHeight, thumbHeight } = rowCardHeights(s, modern)
  const wide = row.shape === 'landscape' || row.shape === 'banner'
  return (modern ? 7 : 24) + 19 + 5 + (!modern && wide ? thumbHeight : posterHeight) / 2
}

// The bar only labels a series when something aired lately, so while the banner is on the first
// series stands in with a sample new season, moved to the front where every mode draws it.
export const withNewReleasePreview = (items, on) => {
  const lead = on ? items.findIndex((item) => item.type === 'Series') : -1
  if (lead < 0) return items
  return [{ ...items[lead], newRelease: { kind: 'newSeason', season: 2 } }].concat(items.filter((_, i) => i !== lead))
}

// The stand-in bar drawn while the sample items load, on its 320 by 140 box: { k, x, y, w, h, r, c,
// a } boxes, with grad set on the accent to surface backdrops.
export const fallbackShapes = (mode, t) => {
  const strong = t.onSurfaceA(0.78)
  const weak = t.onSurfaceA(0.3)
  const poster = t.onSurfaceA(0.16)
  // The renderer's rounding eats a 2px tall pill under the stand in's 3x scale, so those stay square.
  const bar = (x, y, w, h, c, r = h > 2 ? h / 2 : 0) => ({ x, y, w, h, r, c, a: 1 })
  const post = (x, y, w, a = 1) => ({ x, y, w, h: w * 1.5, r: 3, c: poster, a })
  const back = (x, y, w, h, r = 0) => ({ x, y, w, h, r, c: '#ffffffff', a: 1, grad: true })
  let out
  // Moonfin, Aya and the rows pad a full size box without border-box, so they run 16 past it and clip.
  if (mode === 'moonfin') out = [back(0, 0, 336, 156), bar(8, 137, 46, 4, strong), bar(8, 144, 28, 4, weak)]
  else if (mode === 'makd') {
    out = [back(0, 0, 320, 140), bar(12.8, 5, 34, 6, strong), bar(12.8, 15, 24, 3, weak), bar(12.8, 22, 6, 6, weak, 3), bar(21.8, 22, 14, 6, strong), bar(38.8, 22, 6, 6, weak, 3)]
  } else if (mode === 'bookshelf') out = [0, 1, 2, 3, 4].map((i) => post(103 + i * 24, 56.5, 18))
  else if (mode === 'gallery') {
    let x = 109
    out = [14, 14, 22, 14, 14].map((w, i) => {
      const p = post(x, (140 - w * 1.5) / 2, w, i === 2 ? 1 : 0.5)
      x += w + 6
      return p
    })
  } else if (mode === 'aya') {
    out = [back(6, 6, 320, 140, 6), bar(14, 14, 42, 5, strong), bar(298, 12, 8, 2, strong), bar(308, 12, 5, 2, weak), bar(315, 12, 5, 2, weak)]
  } else if (mode === 'banner') {
    out = [back(0, 0, 320, 140), { x: 11.2, y: 39.2, w: 297.6, h: 61.6, r: 5, c: t.onSurfaceA(0.12), a: 1 }, bar(19.2, 68, 38, 4, strong)]
  } else {
    out = [bar(8, 51.25, 30, 3, weak)].concat([0, 1, 2, 3].map((i) => post(8 + i * 17, 60.25, 13)), [bar(8, 85.75, 30, 3, weak)])
  }
  return out.map((b, i) => ({ ...b, k: mode + i }))
}

// CSS "to bottom right" across a w by h box, as a CSS angle.
export const toBottomRight = (w, h) => 180 - (Math.atan(h / w) * 180) / Math.PI
