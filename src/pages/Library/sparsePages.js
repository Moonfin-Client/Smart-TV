// GenreBrowse's sparse list: each item at its server position, so the grid can jump anywhere and let
// go of what scrolled away.
export const BATCH = 100
const BUFFER = 300
const KEEP_UNDER = 600

export const createSparse = (total) => {
  const slots = []
  for (let i = 0; i < total; i++) slots.push(null)
  return { slots, ranges: [], pending: {} }
}

export const isRangeLoaded = (s, start, end) => s.ranges.some((r) => r.start <= start && r.end >= end)

export const placePage = (s, start, items) => {
  items.forEach((it, i) => {
    s.slots[start + i] = it
  })
  if (items.length) {
    s.ranges.push({ start, end: start + items.length - 1 })
    s.ranges.sort((a, b) => a.start - b.start)
  }
}

// The batches the empty slots in [from, to) fall in that aren't read or being read.
export const missingBatches = (s, from, to) => {
  const out = []
  const end = Math.min(to, s.slots.length)
  for (let i = Math.max(0, from); i < end; i++) {
    if (s.slots[i]) continue
    const b = Math.floor(i / BATCH) * BATCH
    if (out.indexOf(b) < 0 && !s.pending[b] && !isRangeLoaded(s, b, b + BATCH - 1)) out.push(b)
    i = b + BATCH - 1
  }
  return out
}

// Once 600 or more are held and nothing is loading, everything over 300 away from index goes, and
// the ranges shrink to what's left.
export const unloadDistant = (s, index) => {
  if (Object.keys(s.pending).length) return 0
  const start = Math.max(0, index - BUFFER)
  const end = Math.min(s.slots.length - 1, index + BUFFER)
  if (s.slots.filter(Boolean).length < KEEP_UNDER) return 0
  let freed = 0
  s.slots.forEach((it, i) => {
    if (it && (i < start || i > end)) {
      s.slots[i] = null
      freed++
    }
  })
  if (freed) {
    s.ranges = s.ranges
      .filter((r) => !(r.end < start || r.start > end))
      .map((r) => ({ start: Math.max(r.start, start), end: Math.min(r.end, end) }))
  }
  return freed
}
