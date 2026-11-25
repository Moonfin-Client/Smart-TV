// Self-check for supWindow.js: node src/pages/Player/supWindow.check.mjs
import assert from 'node:assert/strict'
import { createSupIndex, indexChunk, findSet, epochStart, findSync, startNear, createSupWindowRenderer } from './supWindow.js'

// A .sup segment: "PG", pts, dts, type, size, payload.
const seg = (pts, type, payload) => {
  const b = new Uint8Array(13 + payload.length)
  b[0] = 0x50
  b[1] = 0x47
  b[2] = (pts >>> 24) & 255
  b[3] = (pts >>> 16) & 255
  b[4] = (pts >>> 8) & 255
  b[5] = pts & 255
  b[10] = type
  b[11] = payload.length >> 8
  b[12] = payload.length & 255
  b.set(payload, 13)
  return b
}
// A display set: PCS (state at byte 7), an object of `body` bytes, END.
const set = (pts, state, body) => {
  const pcs = new Uint8Array(11)
  pcs[7] = state
  return [seg(pts, 0x16, pcs), seg(pts, 0x15, new Uint8Array(body)), seg(pts, 0x80, new Uint8Array(0))]
}
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
// 40 subtitles a second apart: each an epoch start, then a clear (normal) half a second later.
const sets = []
for (let k = 0; k < 40; k++) sets.push(...set(k * 90000, 0x80, 3000 + k), ...set(k * 90000 + 45000, 0, 0))
const file = concat(sets)

// Indexed in odd-sized chunks, a segment cut at a chunk's edge is read again from its start.
const ix = createSupIndex()
for (const size of [5000, 7001, 4096]) {
  const j = createSupIndex()
  while (j.pos < file.length) assert.ok(indexChunk(j, file.subarray(j.pos, j.pos + size), j.pos))
  assert.equal(j.pts.length, 80)
  assert.equal(j.end[79], file.length)
  Object.assign(ix, j)
}
assert.equal(ix.start[0], 0)
assert.equal(ix.start[1], ix.end[0])
assert.deepEqual([ix.state[0], ix.state[1]], [0x80, 0])
assert.equal(indexChunk(createSupIndex(), new Uint8Array(20), 0), false, 'not .sup framing')

assert.equal(findSet(ix, -1), -1)
assert.equal(findSet(ix, 0), 0)
assert.equal(findSet(ix, 45000), 1)
assert.equal(findSet(ix, 10 * 90000 + 100), 20)
assert.equal(findSet(ix, 1e12), 79)
assert.equal(epochStart(ix, 21), 20, 'a clear builds on the epoch before it')
assert.equal(epochStart(ix, 20), 20)

// The renderer asks for the windows around the playhead and hands libpgs only those bytes.
const reads = []
const read = async (url, start, end) => {
  reads.push([start, end])
  return file.slice(start, Math.min(file.length, end + 1))
}
const loads = []
const renders = []
class FakePgs {
  constructor() {
    this.implementation = { renderAtIndex: (i) => renders.push(['index', i]), onTimestampsUpdated: null }
  }
  loadFromBuffer(b) {
    loads.push(b.byteLength)
    this.implementation.onTimestampsUpdated()
  }
  renderAtTimestamp(t) {
    renders.push(['t', t])
  }
  dispose() {}
}
const r = await createSupWindowRenderer({ url: 'x', canvas: {}, PgsRenderer: FakePgs, read })
assert.ok(r)
await new Promise((ok) => setTimeout(ok, 10))
r.renderAtTimestamp(10.2)
await new Promise((ok) => setTimeout(ok, 10))
assert.equal(loads.length, 1)
const [from, to] = reads[reads.length - 1]
assert.equal(from, ix.start[20], 'the window starts at the epoch on screen')
assert.equal(to, ix.end[32] - 1, 'and runs 12 sets past it')
assert.ok(loads[0] < file.length / 3)
renders.length = 0
r.renderAtTimestamp(10.6)
assert.deepEqual(renders, [['t', 10.6]], 'a time inside the window draws without a read')
r.renderAtTimestamp(2)
await new Promise((ok) => setTimeout(ok, 10))
assert.equal(loads.length, 2, 'a seek back loads the window there')
assert.equal(reads[reads.length - 1][0], ix.start[4])
renders.length = 0
r.renderAtTimestamp(500)
assert.deepEqual(renders, [['index', -1]], 'past the last set the canvas clears')
r.dispose()
// The same track again starts from the index it had, without reading the file's start again.
const before = reads.length
const again = await createSupWindowRenderer({ url: 'x', canvas: {}, PgsRenderer: FakePgs, read })
again.renderAtTimestamp(10.2)
await new Promise((ok) => setTimeout(ok, 10))
assert.deepEqual(reads.slice(before), [[ix.start[20], ix.end[32] - 1]])
again.dispose()
// A server that ignores ranges gets the whole-file path.
assert.equal(await createSupWindowRenderer({ url: 'y', canvas: {}, PgsRenderer: FakePgs, read: async () => null }), null)
// A film-sized track: a resume an hour in finds a display set before it by halving the file, and the
// index starts there rather than reading everything before it.
const big = []
for (let k = 0; k < 2000; k++) big.push(...set(k * 2 * 90000, 0x80, 1500), ...set(k * 2 * 90000 + 90000, 0, 0))
const film = concat(big)
assert.ok(film.length > 2 * 1024 * 1024)
const sync = findSync(film.subarray(100000, 100000 + 65536))
assert.ok(sync && film[100000 + sync.at + 10] === 0x16 && film[100000 + sync.at + 20] === 0x80, 'a sync lands on an epoch start')
const ranged = []
const readFilm = async (url, start, end) => {
  ranged.push([start, end])
  const b = film.slice(start, Math.min(film.length, end + 1))
  b.total = film.length
  return b
}
const near = await startNear('f', film.length, 3600 * 90000, readFilm)
const fromIx = createSupIndex()
fromIx.pos = near
indexChunk(fromIx, film.subarray(near, near + 4096), near)
assert.ok(fromIx.pts[0] <= 3600 * 90000 && fromIx.pts[0] > 3000 * 90000, 'the index starts shortly before the playhead')
ranged.length = 0
loads.length = 0
const deep = await createSupWindowRenderer({ url: 'film', canvas: {}, PgsRenderer: FakePgs, at: 3600, read: readFilm })
await new Promise((ok) => setTimeout(ok, 50))
deep.renderAtTimestamp(3600.5)
await new Promise((ok) => setTimeout(ok, 50))
const bytesRead = ranged.reduce((n, [a, b]) => n + Math.min(film.length - 1, b) - a + 1, 0)
assert.equal(loads.length, 1, 'the subtitle at the resume point loads')
assert.ok(bytesRead < film.length / 2, `read ${bytesRead} of ${film.length}`)
deep.dispose()
console.log('supWindow ok')
