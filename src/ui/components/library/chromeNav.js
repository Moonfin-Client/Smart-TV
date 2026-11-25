// Only controls wholly past the focused one's edge in that direction count. Ones lined up with it
// beat ones that aren't, then the nearest edge wins, then the nearest middle across.
const past = (r, c, dir) => {
  switch (dir) {
    case 'left': return r.x + r.w <= c.x + 1
    case 'right': return r.x >= c.x + c.w - 1
    case 'up': return r.y + r.h <= c.y + 1
    default: return r.y >= c.y + c.h - 1
  }
}

const gap = (r, c, dir) => {
  switch (dir) {
    case 'left': return c.x - (r.x + r.w)
    case 'right': return r.x - (c.x + c.w)
    case 'up': return c.y - (r.y + r.h)
    default: return r.y - (c.y + c.h)
  }
}

const across = (r, c, dir) => (dir === 'left' || dir === 'right'
  ? Math.abs((r.y + r.h / 2) - (c.y + c.h / 2))
  : Math.abs((r.x + r.w / 2) - (c.x + c.w / 2)))

const lined = (r, c, dir) => (dir === 'left' || dir === 'right'
  ? r.y < c.y + c.h && r.y + r.h > c.y
  : r.x < c.x + c.w && r.x + r.w > c.x)

export const nextControl = (controls, from, dir) => {
  let best = null
  let bestKey = null
  controls.forEach((r) => {
    if (r === from || r.id === from.id || r.skip || !past(r, from, dir)) return
    const key = [lined(r, from, dir) ? 0 : 1, Math.max(0, gap(r, from, dir)), across(r, from, dir)]
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = r
      bestKey = key
    }
  })
  return best
}
