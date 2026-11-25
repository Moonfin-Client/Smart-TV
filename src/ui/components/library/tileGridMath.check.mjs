import assert from 'node:assert/strict'
import { gridLayout, moveIndex, scrollRowFor, virtualGridLayout } from './tileGridMath.js'

// A medium poster library at 1920: ten 174 wide columns of 292 high rows.
assert.deepEqual(gridLayout(1746, 764, 163, 292), { columns: 10, tileWidth: 174, rowHeight: 292, visibleRows: 3, fullRows: 2 })
assert.equal(moveIndex(0, 'left', 10, 25), null)
assert.equal(moveIndex(9, 'right', 10, 25), null)
assert.equal(moveIndex(24, 'right', 10, 25), null)
assert.equal(moveIndex(17, 'down', 10, 25), 24)
assert.equal(moveIndex(24, 'down', 10, 25), null)
assert.equal(moveIndex(3, 'up', 10, 25), null)
assert.equal(moveIndex(13, 'up', 10, 25), 3)
assert.equal(scrollRowFor(2, 0, 2), 1)
assert.equal(scrollRowFor(0, 1, 2), 0)
assert.equal(scrollRowFor(1, 1, 2), 1)
// Genres at medium: 320 by 180 cells with 20 between them.
assert.deepEqual(virtualGridLayout(1746, 320, 180, 20), { columns: 5, itemWidth: 333, itemHeight: 187, stepX: 353, stepY: 207 })
console.log('tileGridMath ok')
