// A PGS sidecar (.sup) drawn a few display sets at a time. libpgs keeps a whole file and a copy of every
// bitmap in memory, which for a film's track (Avatar's is 42 MB) ran webOS out of memory and restarted
// the app. Here the file is indexed once through range requests, keeping no bytes, and libpgs only ever
// holds the sets around the playhead.

const CHUNK = 256 * 1024
// Sets handed to libpgs at once past the one on screen. Each is a few tens of KB.
const AHEAD = 12
// An update that isn't an epoch start or acquisition point draws over the sets before it, so a window
// reaches back to one that is, but never further than this.
const MAX_BACK = 64
const PCS = 0x16
const END = 0x80
const TYPES = [0x14, 0x15, PCS, 0x17, END]

export const createSupIndex = () => ({ pts: [], start: [], end: [], state: [], pos: 0, setStart: -1, setPts: 0, setState: 0, done: false })

// Indexes the whole segments in `bytes`, read from `offset` in the file. ix.pos ends at the first segment
// that isn't whole yet, where the next read starts. Returns false when the bytes aren't .sup framing.
export const indexChunk = (ix, bytes, offset) => {
  let p = ix.pos - offset
  while (p + 13 <= bytes.length) {
    if (bytes[p] !== 0x50 || bytes[p + 1] !== 0x47) return false
    const type = bytes[p + 10]
    const size = (bytes[p + 11] << 8) | bytes[p + 12]
    if (p + 13 + size > bytes.length) break
    if (ix.setStart < 0) ix.setStart = offset + p
    if (type === PCS && size >= 8) {
      ix.setPts = ((bytes[p + 2] << 24) >>> 0) + (bytes[p + 3] << 16) + (bytes[p + 4] << 8) + bytes[p + 5]
      ix.setState = bytes[p + 13 + 7]
    }
    p += 13 + size
    if (type === END) {
      ix.pts.push(ix.setPts)
      ix.start.push(ix.setStart)
      ix.end.push(offset + p)
      ix.state.push(ix.setState)
      ix.setStart = -1
    }
  }
  ix.pos = offset + p
  return true
}

// The last display set presented at or before pts (90 kHz), or -1.
export const findSet = (ix, pts) => {
  let lo = 0
  let hi = ix.pts.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (ix.pts[mid] <= pts) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

// The set libpgs has to start from to draw set i: the epoch start or acquisition point it builds on.
export const epochStart = (ix, i) => {
  let j = i
  while (j > 0 && ix.state[j] === 0 && i - j < MAX_BACK) j--
  return j
}

// The first display set in bytes that starts an epoch or an acquisition point (so it draws without the
// sets before it), checked by the segment header after it: { at, pts }, or null.
export const findSync = (b) => {
  for (let p = 0; p + 34 <= b.length; p++) {
    if (b[p] !== 0x50 || b[p + 1] !== 0x47 || b[p + 10] !== PCS || b[p + 20] === 0) continue
    const next = p + 13 + ((b[p + 11] << 8) | b[p + 12])
    if (next + 11 > b.length || b[next] !== 0x50 || b[next + 1] !== 0x47 || TYPES.indexOf(b[next + 10]) < 0) continue
    return { at: p, pts: ((b[p + 2] << 24) >>> 0) + (b[p + 3] << 16) + (b[p + 4] << 8) + b[p + 5] }
  }
  return null
}

// Where to start indexing for a playhead deep into a file of `total` bytes: a display set at or before
// pts, found by halving the file with small reads. Indexing a film from its start to a resume point an
// hour in reads 20 MB that webOS keeps as garbage.
const PROBE = 64 * 1024
export const startNear = async (url, total, pts, read) => {
  let lo = 0
  let hi = total
  let best = 0
  while (hi - lo > CHUNK) {
    const mid = Math.floor((lo + hi) / 2)
    const bytes = await read(url, mid, mid + PROBE - 1)
    const sync = bytes && findSync(bytes)
    if (!sync) break
    if (sync.pts <= pts) {
      lo = mid
      best = mid + sync.at
    } else hi = mid
  }
  return best
}

// Range GET as bytes, or null when the server answers with anything but the range (a 200 is the whole file).
// The bytes carry the file's size as `total`.
const readRange = (url, start, end) =>
  new Promise((resolve) => {
    const x = new XMLHttpRequest()
    x.open('GET', url, true)
    x.responseType = 'arraybuffer'
    x.setRequestHeader('Range', `bytes=${start}-${end}`)
    x.onreadystatechange = () => {
      if (x.readyState === 2 && x.status !== 206) {
        x.abort()
        resolve(null)
      }
    }
    x.onload = () => {
      if (x.status !== 206 || !x.response) return resolve(null)
      const bytes = new Uint8Array(x.response)
      bytes.total = Number(String(x.getResponseHeader('Content-Range')).split('/')[1]) || 0
      resolve(bytes)
    }
    x.onerror = () => resolve(null)
    x.send()
  })

// Each read's bytes are garbage once indexed, and Chrome 38 only collects them after about 100 MB, so the
// index stays this far ahead of the playhead rather than reading the whole file at once.
const SCAN_AHEAD_SECONDS = 300
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// The last few tracks' indexes, so picking one again or playing on carries on from it.
const kept = []
const KEEP = 4

// Draws the track at `url` on `canvas` with libpgs's PgsRenderer, from `at` seconds. Resolves to
// { renderAtTimestamp, dispose }, or null when the file can't be read in ranges, for the caller to load it
// whole instead.
export const createSupWindowRenderer = async ({ url, canvas, PgsRenderer, at = 0, read = readRange }) => {
  const found = kept.filter((k) => k.url === url)[0]
  let ix = found && found.ix
  if (!ix) {
    ix = createSupIndex()
    const first = await read(url, 0, CHUNK - 1)
    if (!first || !indexChunk(ix, first, 0)) return null
    if (first.length < CHUNK) ix.done = true
    ix.total = first.total || 0
    kept.unshift({ url, ix })
    kept.length = Math.min(kept.length, KEEP)
  }
  const r = new PgsRenderer({ canvas, mode: 'mainThread' })
  // libpgs skips a render when the set index hasn't changed, which a new window can't tell apart, so a
  // load goes through -1 first. Both draws land in the same frame.
  const impl = r.implementation
  let clock = Math.max(0, at)
  let win = null
  let loading = null
  let disposed = false
  let scanning = false
  let moving = false
  impl.onTimestampsUpdated = () => {
    impl.renderAtIndex(-1)
    r.renderAtTimestamp(clock)
  }
  const load = async (from, to) => {
    const mine = (loading = { from, to })
    const bytes = await read(url, ix.start[from], ix.end[to] - 1)
    if (disposed || loading !== mine) return
    loading = null
    if (!bytes) return
    win = { from, to }
    r.loadFromBuffer(bytes.buffer)
  }
  // A playhead before the index, or far past the part of the file read so far, starts a new index near it.
  const indexed = (seconds) => {
    const pts = seconds * 90000
    if (!ix.total || ix.done || moving) return true
    if (ix.base > 0 && ix.pts.length && pts < ix.pts[0]) return false
    return !ix.pts.length || pts <= ix.pts[ix.pts.length - 1] + SCAN_AHEAD_SECONDS * 90000
  }
  const moveTo = async (seconds) => {
    moving = true
    const from = await startNear(url, ix.total, Math.max(0, seconds - 30) * 90000, read)
    moving = false
    if (disposed) return
    const next = createSupIndex()
    next.total = ix.total
    next.pos = next.base = from
    ix = next
    kept.forEach((k) => k.url === url && (k.ix = next))
    win = null
    loading = null
    scan()
  }
  const update = () => {
    if (disposed) return
    if (!indexed(clock)) {
      moveTo(clock)
      return
    }
    const last = ix.pts.length - 1
    const i = findSet(ix, clock * 90000)
    // The set after the one on screen says when it ends, so the last one indexed waits for more of the file.
    if (i < 0 || i === last) {
      if (win) impl.renderAtIndex(-1)
      return
    }
    const j = epochStart(ix, i)
    if (win && j >= win.from && i + 1 <= win.to) {
      r.renderAtTimestamp(clock)
      if (i + 2 >= win.to && win.to < last && !loading) load(j, Math.min(last, i + AHEAD))
      return
    }
    if (!loading || j < loading.from || i + 1 > loading.to) load(j, Math.min(last, i + AHEAD))
  }
  const scan = async () => {
    if (scanning) return
    scanning = true
    let fails = 0
    while (!ix.done && !disposed) {
      if (moving || (ix.pts.length && ix.pts[ix.pts.length - 1] > (clock + SCAN_AHEAD_SECONDS) * 90000)) {
        await wait(1000)
        continue
      }
      const at = ix.pos
      const bytes = await read(url, at, at + CHUNK - 1)
      // A newer renderer on the same index, or a new index, may have moved on meanwhile.
      if (disposed || ix.pos !== at) continue
      // A file that ends on a chunk's edge answers the next range with a 416, so a read that keeps failing ends the index.
      if (!bytes && ++fails < 3) {
        await wait(1000)
        continue
      }
      if (!bytes || !indexChunk(ix, bytes, at) || bytes.length < CHUNK) ix.done = true
      fails = 0
      update()
    }
    scanning = false
  }
  if (indexed(clock)) scan()
  else moveTo(clock)
  return {
    renderAtTimestamp: (t) => {
      clock = Math.max(0, t)
      update()
    },
    dispose: () => {
      disposed = true
      r.dispose()
    },
  }
}
