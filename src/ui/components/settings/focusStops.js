// Where focus can land on a settings screen and where each arrow takes it, to the nearest stop in
// that direction.

// Every place focus can land, in list coordinates.
export const stopsOf = (rows) => {
  const stops = []
  rows.forEach((r) => {
    if (r.type === 'card' && !r.static) stops.push({ sid: r.sid, x: r.x, y: r.y, w: r.w, h: r.h, row: r })
    else if (r.type === 'block' && r.stops) r.stops.forEach((s) => stops.push({ ...s, x: (r.x || 0) + s.x, y: r.y + s.y, row: r }))
  })
  return stops
}

// A 5-way focus search. Every candidate falls in one of nine groups around the focused stop, the
// straight groups are tried before the oblique ones, and within a group the nearest wins. A stop's
// place is in list coordinates, which only shifts every rect by the same amount.
const OBLIQUE = 5
const STRAIGHT = 1
const OVERLAP = 0.5

const rectOf = (s) => {
  const r = { left: s.x, top: s.y, width: s.w, height: s.h, stop: s, right: s.x + s.w, bottom: s.y + s.h }
  r.center = { x: r.left + Math.floor(r.width / 2), y: r.top + Math.floor(r.height / 2) }
  r.center.left = r.center.right = r.center.x
  r.center.top = r.center.bottom = r.center.y
  return r
}

const gridPos = (current, next) => {
  const c = current.center
  const x = c.x < next.left ? 0 : c.x <= next.right ? 1 : 2
  const y = c.y < next.top ? 0 : c.y <= next.bottom ? 1 : 2
  return y * 3 + x
}

const extendedGridPos = (current, next) => {
  const x = current.right <= next.left ? 0 : current.left < next.right ? 1 : 2
  const y = current.bottom <= next.top ? 0 : current.top < next.bottom ? 1 : 2
  return y * 3 + x
}

// A point has no width or height, so its overlap tests are NaN and never pass.
const partition = (rects, target, groupOf) => {
  const groups = [[], [], [], [], [], [], [], [], []]
  rects.forEach((rect) => {
    const id = groupOf(rect, target)
    groups[id].push(rect)
    if (id === 0 || id === 2 || id === 6 || id === 8) {
      if (rect.left <= target.right - target.width * OVERLAP) {
        if (id === 2) groups[1].push(rect)
        else if (id === 8) groups[7].push(rect)
      }
      if (rect.right >= target.left + target.width * OVERLAP) {
        if (id === 0) groups[1].push(rect)
        else if (id === 6) groups[7].push(rect)
      }
      if (rect.top <= target.bottom - target.height * OVERLAP) {
        if (id === 6) groups[3].push(rect)
        else if (id === 8) groups[5].push(rect)
      }
      if (rect.bottom >= target.top + target.height * OVERLAP) {
        if (id === 0) groups[3].push(rect)
        else if (id === 2) groups[5].push(rect)
      }
    }
  })
  return groups
}

const distances = (t) => {
  const pos = (d) => (d < 0 ? 0 : d)
  return {
    plumb: (r) => pos(r.center.x < t.center.x ? t.center.x - r.right : r.left - t.center.x),
    horizon: (r) => pos(r.center.y < t.center.y ? t.center.y - r.bottom : r.top - t.center.y),
    bottomEdge: (r) => pos(r.center.y < t.center.y ? t.bottom - r.top : r.top - t.bottom),
    leftEdge: (r) => pos(r.center.x < t.center.x ? t.left - r.right : r.left - t.left),
    rightEdge: (r) => pos(r.center.x < t.center.x ? t.right - r.left : r.left - t.right),
    topEdge: (r) => pos(r.center.y < t.center.y ? t.top - r.bottom : r.top - t.top),
    top: (r) => r.top,
    bottom: (r) => -r.bottom,
    left: (r) => r.left,
    right: (r) => -r.right,
  }
}

// The groups each direction tries, in order, with how a group sorts its members and how far its
// best one counts as.
const priorities = (dir, g, ig, d) => {
  const straight = (group, sort, diff) => ({ group, sort, diff, min: 0, mult: STRAIGHT })
  const oblique = (group, sort, diff) => ({ group, sort, diff, min: 1, mult: OBLIQUE })
  switch (dir) {
    case 'left':
      return [
        straight(ig[0].concat(ig[3], ig[6]), [d.plumb, d.horizon, d.top], [d.leftEdge]),
        straight(g[3], [d.plumb, d.horizon, d.top], [d.leftEdge]),
        oblique(g[0], [d.horizon, d.right, d.topEdge], [d.leftEdge, d.topEdge]),
        oblique(g[6], [d.horizon, d.right, d.topEdge], [d.leftEdge, d.bottomEdge]),
      ]
    case 'right':
      return [
        straight(ig[2].concat(ig[5], ig[8]), [d.plumb, d.horizon, d.top], [d.rightEdge]),
        straight(g[5], [d.plumb, d.horizon, d.top], [d.rightEdge]),
        oblique(g[2], [d.horizon, d.left, d.topEdge], [d.rightEdge, d.topEdge]),
        oblique(g[8], [d.horizon, d.left, d.topEdge], [d.rightEdge, d.bottomEdge]),
      ]
    case 'up':
      return [
        straight(ig[0].concat(ig[1], ig[2]), [d.horizon, d.plumb, d.left], [d.topEdge]),
        straight(g[1], [d.horizon, d.plumb, d.left], [d.topEdge]),
        oblique(g[0], [d.plumb, d.bottom, d.leftEdge], [d.topEdge, d.leftEdge]),
        oblique(g[2], [d.plumb, d.bottom, d.leftEdge], [d.topEdge, d.rightEdge]),
      ]
    default:
      return [
        straight(ig[6].concat(ig[7], ig[8]), [d.horizon, d.plumb, d.left], [d.bottomEdge]),
        straight(g[7], [d.horizon, d.plumb, d.left], [d.bottomEdge]),
        oblique(g[6], [d.plumb, d.top, d.leftEdge], [d.bottomEdge, d.leftEdge]),
        oblique(g[8], [d.plumb, d.top, d.leftEdge], [d.bottomEdge, d.rightEdge]),
      ]
  }
}

// The stop an arrow from [from] lands on, or null when there's none that way.
export const nextStop = (stops, from, dir) => {
  if (!from) return null
  const target = rectOf(from)
  const rects = stops.filter((s) => s !== from && s.sid !== from.sid).map(rectOf)
  const vertical = dir === 'up' || dir === 'down'
  const groups = partition(rects, target, (r, t) => (vertical ? extendedGridPos(r, t) : gridPos(r, t)))
  const inner = partition(groups[4], target.center, gridPos)
  let best = null
  let bestScore = Infinity
  priorities(dir, groups, inner, distances(target)).forEach((p) => {
    if (!p.group.length) return
    const sorted = p.group.slice().sort((a, b) => {
      for (let i = 0; i < p.sort.length; i++) {
        const delta = p.sort[i](a) - p.sort[i](b)
        if (delta) return delta
      }
      return 0
    })
    const first = sorted[0]
    const distance = p.diff.reduce((sum, fn) => sum + fn(first), 0)
    // Squaring this over the focused edge and adding the edge wouldn't change the order, so the
    // plain distance does.
    const score = p.mult * (distance || p.min)
    if (score < bestScore) {
      bestScore = score
      best = first.stop
    }
  })
  return best
}
