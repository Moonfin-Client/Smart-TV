// Self-check for themeColor.js: node src/ui/themeColor.check.mjs
import assert from 'node:assert/strict'
import { lc, rgba, shadowColor } from './themeColor.js'

// Glass's surface (#D90E1117) and the charcoal navbar at 70 percent.
assert.equal(lc('#D90E1117'), '#0e1117d9')
assert.equal(lc('#FF36454F', 0.7), '#36454fb3')
assert.equal(lc('#36454F'), '#36454fff')
assert.equal(rgba('#ffffff', 0.6), '#ffffff99')
// White at 25 percent, halved, comes back premultiplied: 0x20 color channels under a 0x20 alpha.
assert.equal(shadowColor('#ffffff40', 0.5), 0x20202020)
assert.equal(shadowColor('#0a84ffff'), 0x0a84ffff)
console.log('themeColor ok')
