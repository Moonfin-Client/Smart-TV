// A 5-way focus search between a dialog's controls. Candidates are split into a 3x3 grid around the focused rect
// (overlap past half its size counts as straight ahead), each direction ranks its groups by fixed rules, and the best
// of each group competes on a weighted distance where straight beats oblique. Items are {id, x, y, w, h}. Pure, so
// spotlight.check.mjs runs it under node.
const STRAIGHT_MULTIPLIER = 1
const OBLIQUE_MULTIPLIER = 5
const OVERLAP = 0.5

const rectOf = (it) => {
  const r = { id: it.id, left: it.x, top: it.y, width: it.w, height: it.h, right: it.x + it.w, bottom: it.y + it.h }
  const x = r.left + Math.floor(r.width / 2)
  const y = r.top + Math.floor(r.height / 2)
  r.center = { x, y, left: x, right: x, top: y, bottom: y }
  return r
}

const gridPosition = (current, next) => ({
  x: current.center.x < next.left ? 0 : current.center.x <= next.right ? 1 : 2,
  y: current.center.y < next.top ? 0 : current.center.y <= next.bottom ? 1 : 2,
})

const extendedGridPosition = (current, next) => ({
  x: current.right <= next.left ? 0 : current.left < next.right ? 1 : 2,
  y: current.bottom <= next.top ? 0 : current.top < next.bottom ? 1 : 2,
})

const partition = (rects, target, groupOf) => {
  const groups = [[], [], [], [], [], [], [], [], []]
  rects.forEach((rect) => {
    const p = groupOf(rect, target)
    const id = p.y * 3 + p.x
    groups[id].push(rect)
    if (id === 0 || id === 2 || id === 6 || id === 8) {
      const width = target.width || 0
      const height = target.height || 0
      if (rect.left <= target.right - width * OVERLAP) {
        if (id === 2) groups[1].push(rect)
        else if (id === 8) groups[7].push(rect)
      }
      if (rect.right >= target.left + width * OVERLAP) {
        if (id === 0) groups[1].push(rect)
        else if (id === 6) groups[7].push(rect)
      }
      if (rect.top <= target.bottom - height * OVERLAP) {
        if (id === 6) groups[3].push(rect)
        else if (id === 8) groups[5].push(rect)
      }
      if (rect.bottom >= target.top + height * OVERLAP) {
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
    targetBottom: (r) => pos(r.center.y < t.center.y ? t.bottom - r.top : r.top - t.bottom),
    targetLeft: (r) => pos(r.center.x < t.center.x ? t.left - r.right : r.left - t.left),
    targetRight: (r) => pos(r.center.x < t.center.x ? t.right - r.left : r.left - t.right),
    targetTop: (r) => pos(r.center.y < t.center.y ? t.top - r.bottom : r.top - t.top),
    top: (r) => r.top,
    bottom: (r) => -r.bottom,
    left: (r) => r.left,
    right: (r) => -r.right,
  }
}

const prioritize = (priorities, edge) => {
  const best = []
  priorities.forEach((p) => {
    if (!p.group.length) return
    p.group.sort((a, b) => {
      for (let i = 0; i < p.distance.length; i++) {
        const delta = p.distance[i](a) - p.distance[i](b)
        if (delta) return delta
      }
      return 0
    })
    const target = p.group[0]
    let d = 0
    p.difference.forEach((fn) => {
      d += fn(target)
    })
    best.push({ distance: Math.pow((p.multiplier * (d || p.min)) / edge, 2) + edge, target })
  })
  if (!best.length) return null
  best.sort((a, b) => a.distance - b.distance)
  return best[0].target
}

const searchFrom = (t, dir, rects) => {
  const f = distances(t)
  const groups = partition(rects, t, (r, dest) => (dir === 'up' || dir === 'down' ? extendedGridPosition(r, dest) : gridPosition(r, dest)))
  const inner = partition(groups[4], t.center, gridPosition)
  const straight = (group, distance, difference) => ({ group, distance, difference, min: 0, multiplier: STRAIGHT_MULTIPLIER })
  const oblique = (group, distance, difference) => ({ group, distance, difference, min: 1, multiplier: OBLIQUE_MULTIPLIER })
  let priorities
  let edge
  if (dir === 'left') {
    edge = t.left
    priorities = [
      straight(inner[0].concat(inner[3], inner[6]), [f.plumb, f.horizon, f.top], [f.targetLeft]),
      straight(groups[3], [f.plumb, f.horizon, f.top], [f.targetLeft]),
      oblique(groups[0], [f.horizon, f.right, f.targetTop], [f.targetLeft, f.targetTop]),
      oblique(groups[6], [f.horizon, f.right, f.targetTop], [f.targetLeft, f.targetBottom]),
    ]
  } else if (dir === 'right') {
    edge = t.right
    priorities = [
      straight(inner[2].concat(inner[5], inner[8]), [f.plumb, f.horizon, f.top], [f.targetRight]),
      straight(groups[5], [f.plumb, f.horizon, f.top], [f.targetRight]),
      oblique(groups[2], [f.horizon, f.left, f.targetTop], [f.targetRight, f.targetTop]),
      oblique(groups[8], [f.horizon, f.left, f.targetTop], [f.targetRight, f.targetBottom]),
    ]
  } else if (dir === 'up') {
    edge = t.top
    priorities = [
      straight(inner[0].concat(inner[1], inner[2]), [f.horizon, f.plumb, f.left], [f.targetTop]),
      straight(groups[1], [f.horizon, f.plumb, f.left], [f.targetTop]),
      oblique(groups[0], [f.plumb, f.bottom, f.targetLeft], [f.targetTop, f.targetLeft]),
      oblique(groups[2], [f.plumb, f.bottom, f.targetLeft], [f.targetTop, f.targetRight]),
    ]
  } else if (dir === 'down') {
    edge = t.bottom
    priorities = [
      straight(inner[6].concat(inner[7], inner[8]), [f.horizon, f.plumb, f.left], [f.targetBottom]),
      straight(groups[7], [f.horizon, f.plumb, f.left], [f.targetBottom]),
      oblique(groups[6], [f.plumb, f.top, f.targetLeft], [f.targetBottom, f.targetLeft]),
      oblique(groups[8], [f.plumb, f.top, f.targetLeft], [f.targetBottom, f.targetRight]),
    ]
  } else {
    return null
  }
  return prioritize(priorities, edge)
}

// The control focus moves to from `curId` in `dir`, or null when there's none and focus stays put.
export const spotlightMove = (items, curId, dir) => {
  const cur = items.find((i) => i.id === curId)
  if (!cur) return items.length ? items[0].id : null
  const t = rectOf(cur)
  const hit = searchFrom(t, dir, items.filter((i) => i.id !== curId).map(rectOf))
  return hit ? hit.id : null
}
