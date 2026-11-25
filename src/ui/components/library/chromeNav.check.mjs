import assert from 'node:assert/strict'
import { nextControl } from './chromeNav.js'

const box = (id, x, y, w = 44, h = 44) => ({ id, x, y, w, h })
// Classic: the search over on the right, the toolbar below on the left.
const search = box('search', 1453, 12, 380, 66)
const home = box('home', 87, 248)
const sort = box('sort', 134, 248)
const m = box('M', 814, 248)
const list = [search, home, sort, m]
assert.equal(nextControl(list, m, 'up').id, 'search')
assert.equal(nextControl(list, home, 'right').id, 'sort')
assert.equal(nextControl(list, sort, 'left').id, 'home')
assert.equal(nextControl(list, home, 'left'), null)
assert.equal(nextControl(list, home, 'down'), null)
// Docked letters, seven to a row 52 apart.
const letters = '#ABCDEFGHIJ'.split('').map((l, i) => box(l, 30 + (i % 7) * 52, 582 + Math.floor(i / 7) * 52))
const display = box('display', 30, 426, 359, 66)
const all = [display].concat(letters)
assert.equal(nextControl(all, letters[6], 'down').id, 'J')
assert.equal(nextControl(all, letters[2], 'down').id, 'I')
assert.equal(nextControl(all, letters[3], 'up').id, 'display')
assert.equal(nextControl(all, letters[6], 'right'), null)
console.log('chromeNav ok')
