// The numbers are measured from the Genres and Favorites sheets at 1920x1080.
import assert from 'node:assert/strict'
import { layoutSide } from './sideLayout.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.6, `${msg}: ${a} vs ${b}`)
const radios = (n, id) => Array.from({ length: n }, (_, i) => ({ kind: 'radio', id: `${id}${i}` }))
const sortRows = [{ kind: 'title' }, { kind: 'label' }, ...radios(5, 's'), { kind: 'end' }, { kind: 'label' }, ...radios(2, 'l')]

// Genres' Sort & Filter: title 40, label 101, rows from 146 every 56, the Library label at 449.8.
const g = layoutSide(sortRows)
assert.deepEqual([g[0].y, g[1].y, g[2].y, g[3].y], [40, 101, 146, 202])
near(g[8].y, 449.8, 'second label')
near(g[9].y, 494.8, 'its first row')
assert.equal(g[2].h, 52)
// Under Neon Pulse its rows are 53 tall, which puts the Library label at 454.8.
const n = layoutSide(sortRows, undefined, true)
near(n[8].y, 454.8, 'neon second label')
near(n[3].y - n[2].y, 57, 'neon row pitch')
// Genres' Settings: the header at 40, the title at 77 and the setting row at 138, 84 tall.
const st = layoutSide([{ kind: 'header' }, { kind: 'title' }, { kind: 'setting', id: 'size' }])
assert.deepEqual([st[0].y, st[1].y, st[2].y, st[2].h], [40, 77, 138, 84])
// Favorites' Sort By: label 105, rows from 154 every 58.
const f = layoutSide([{ kind: 'title' }, { kind: 'label' }, ...radios(3, 'f')], { titleGap: 32, labelGap: 16, radioH: 54 })
assert.deepEqual([f[1].y, f[2].y, f[3].y, f[4].y], [105, 154, 212, 270])
console.log('sideLayout ok')
