import { focusScroll } from './focusScroll.js'

// Where the Mosaic panel puts its tiles, and how focus moves between them, in plain JS so the check
// runs in node.

const PAD_X = 42
// The header's 6px bottom margin collapses into the tile's 18px top margin.
const HOME_Y = 111
const BIG_W = 369
const BIG_H = 144
const SMALL_W = 113
const SMALL_H = 90
export const AVATAR_RECT = { key: 'avatar', x: 42, y: 34.5, w: 57, h: 57 }

// Each entry's tile as { key, kind, x, y, w, h, e }: the wide Home tile, two columns of big tiles
// for the libraries, Live TV and Seerr, then rows of six small tiles for the rest.
export const mosaicPlaces = (entries) => {
  const home = entries[0]
  const live = entries.find((e) => e.key === 'livetv')
  const discover = entries.find((e) => e.key === 'discover')
  const small = entries.filter((e) => e !== home && e !== live && e !== discover && !e.library)
  const big = entries.filter((e) => e.library).map((e) => ({ e, kind: 'big' }))
  if (live) big.push({ e: live, kind: 'live' })
  if (discover) big.push({ e: discover, kind: 'discover' })
  const out = [{ key: home.key, kind: 'home', x: PAD_X, y: HOME_Y, w: 756, h: 144, e: home }]
  let y = HOME_Y + 144 + 18
  big.forEach((b, i) => {
    out.push({
      key: b.e.key,
      kind: b.kind,
      x: PAD_X + (i % 2) * (BIG_W + 18),
      y: y + Math.floor(i / 2) * (BIG_H + 18),
      w: BIG_W,
      h: BIG_H,
      e: b.e,
    })
  })
  if (big.length) y += Math.ceil(big.length / 2) * (BIG_H + 18)
  small.forEach((e, i) => {
    out.push({
      key: e.key,
      kind: 'small',
      x: PAD_X + (i % 6) * (SMALL_W + 15),
      y: y + Math.floor(i / 6) * (SMALL_H + 15),
      w: SMALL_W,
      h: SMALL_H,
      e,
    })
  })
  return out
}

// The nearest rect lying wholly in that direction, favoring ones in line. Returns its key, or null
// when there's none that way.
export const mosaicMove = (rects, fromKey, dir) => {
  const from = rects.find((x) => x.key === fromKey)
  if (!from) return null
  const cx = from.x + from.w / 2
  const cy = from.y + from.h / 2
  let best = null
  let bestScore = Infinity
  rects.forEach((r) => {
    if (r.key === from.key) return
    const rx = r.x + r.w / 2
    const ry = r.y + r.h / 2
    let main
    let cross
    if (dir === 'right') {
      if (r.x < from.x + from.w - 1) return
      main = r.x - (from.x + from.w)
      cross = Math.max(0, Math.abs(ry - cy) - (r.h + from.h) / 2)
    } else if (dir === 'left') {
      if (r.x + r.w > from.x + 1) return
      main = from.x - (r.x + r.w)
      cross = Math.max(0, Math.abs(ry - cy) - (r.h + from.h) / 2)
    } else if (dir === 'down') {
      if (r.y < from.y + from.h - 1) return
      main = r.y - (from.y + from.h)
      cross = Math.abs(rx - cx)
    } else {
      if (r.y + r.h > from.y + 1) return
      main = from.y - (r.y + r.h)
      cross = Math.abs(rx - cx)
    }
    const score = main + cross * 2
    if (score < bestScore) {
      bestScore = score
      best = r
    }
  })
  return best ? best.key : null
}

// The panel's scroll once `r` takes focus, by its unscaled box.
export const mosaicScroll = (r, scroll, contentH) => focusScroll(r.y, r.h, scroll, 1080, Math.max(0, contentH - 1080))
