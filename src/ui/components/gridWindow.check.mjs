// node --conditions=browser src/ui/components/gridWindow.check.mjs
import assert from 'node:assert/strict'
import { edgeOffset, windowOf } from './gridWindow.js'

// 300 tall cards in 324 steps, 1000 of room: the fourth line (top 972) scrolls in until it sits the
// 24 affordance short of the bottom.
const base = { px: 0, step: 324, gap: 24, room: 1000, lines: 10, affordance: 24 }
assert.equal(edgeOffset({ ...base, top: 0 }), 0)
assert.equal(edgeOffset({ ...base, top: 324 }), 0)
assert.equal(edgeOffset({ ...base, top: 972 }), 972 - (1000 - 300 - 24))
// Back up to a line above the view lines it up with the top.
assert.equal(edgeOffset({ ...base, px: 600, top: 324 }), 324)
// Never past the end of the content.
assert.equal(edgeOffset({ ...base, top: 9 * 324 }), 10 * 324 - 24 - 1000)

// A tile grid of 3 lanes and a pool of 12 slots reuses slots as it scrolls.
const w = windowOf({ count: 20, lanes: 3, from: 3, to: 15, pool: 12, tile: true })
assert.equal(w.length, 12)
assert.equal(w[0].slot, 's3')
assert.equal(w[9].slot, 's0')
assert.deepEqual([w[4].lane, w[4].line], [1, 2])
// The window stops at the last item.
assert.equal(windowOf({ count: 5, lanes: 3, from: 3, to: 15, pool: 12, tile: true }).length, 2)
console.log('gridWindow ok')
