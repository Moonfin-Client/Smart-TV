import assert from 'node:assert/strict'
import { atlasColumn, atlasLinkScroll } from './atlasColumn.js'

// With 4 and 12 links: the title stays, then folds away and the list scrolls.
assert.deepEqual(atlasColumn(4), { titleH: 33, top: 51, maxScroll: 0 })
assert.deepEqual(atlasColumn(12), { titleH: 0, top: 18, maxScroll: 393 })
assert.equal(atlasColumn(6).titleH, 3)
// Down the 12: still in view through the sixth, the seventh comes to the middle.
assert.equal(atlasLinkScroll(5, 0, 12), 0)
assert.equal(atlasLinkScroll(6, 0, 12), 239)
assert.equal(atlasLinkScroll(8, 239, 12), 239)
// Back up: the fourth is partly hidden and shows just enough, the third comes back to the top.
assert.equal(atlasLinkScroll(4, 239, 12), 239)
assert.equal(atlasLinkScroll(3, 239, 12), 216)
assert.equal(atlasLinkScroll(2, 216, 12), 0)
console.log('atlasColumn ok')
