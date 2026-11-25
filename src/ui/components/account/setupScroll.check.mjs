import assert from 'node:assert/strict'
import { columnScroll, listScroll } from './setupScroll.js'

// The tour with the languages open: column 160..910, content 986 tall.
const col = { viewTop: 160, viewH: 750, contentH: 986 }
// Prefer Default Audio Track, 776.5..923.5 on screen, comes in 24px clear of the bottom.
assert.equal(columnScroll({ ...col, scroll: 0, top: 776.5, bottom: 923.5 }), 38)
// Neon Pulse above the top at scroll 236 comes back down with 24px to spare.
assert.equal(columnScroll({ ...col, scroll: 236, top: 381.6, bottom: 441.6 }), 198)
// The last row scrolls to the end, and a row in view leaves it alone.
assert.equal(columnScroll({ ...col, scroll: 126, top: 1024.5, bottom: 1101.4, last: true }), 236)
assert.equal(columnScroll({ ...col, scroll: 0, top: 447.6, bottom: 507.6 }), 0)
// Picker: Afrikaans one row past the bottom of a 747px list sits flush, then English flush at the top.
assert.equal(listScroll({ scroll: 0, top: 693, bottom: 762, viewH: 747, contentH: 3936 }), 15)
assert.equal(listScroll({ scroll: 84, top: 69, bottom: 141, viewH: 747, contentH: 3936 }), 69)
console.log('setup scroll ok')
