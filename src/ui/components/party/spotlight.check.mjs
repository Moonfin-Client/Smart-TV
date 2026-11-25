// Self-check for spotlight.js: node src/ui/components/party/spotlight.check.mjs
// The rects and expected moves were measured from a Watch Parties dialog in a browser, with getBoundingClientRect on
// each control and the control that took focus after each key.
import assert from 'node:assert/strict'
import { spotlightMove } from './spotlight.js'

const R = (id, x, y, w, h) => ({ id, x, y, w, h })
const walk = (items, start, steps) => {
  let cur = start
  steps.forEach(([dir, expected]) => {
    const next = spotlightMove(items, cur, dir)
    if (next) cur = next
    assert.equal(cur, expected, `${dir} should land on ${expected}`)
  })
}

// The room list: Start, the code field, a Moonbase tile, a PIN tile and a SyncPlay tile.
const rooms = [
  R('close', 1713, 286, 39, 44), R('start', 168, 367, 460, 92), R('code', 168, 475, 460, 63),
  R('tile1', 684, 414, 492, 376), R('tile2', 1201.9, 414, 492, 376), R('sync', 684, 816, 492, 376),
]
walk(rooms, 'start', [
  ['down', 'code'], ['right', 'tile1'], ['right', 'tile2'], ['down', 'sync'], ['left', 'code'], ['up', 'start'],
  ['up', 'close'], ['left', 'start'], ['up', 'close'], ['up', 'close'], ['down', 'tile2'],
])

// The host's lobby with voting on: the vote switch, search, two titles up for the vote, then the people column.
const lobby = [
  R('close', 1713, 145.5, 39, 44), R('self', 1292, 285.5, 460, 72), R('voting', 668, 361.5, 584, 43),
  R('search', 668, 498.5, 584, 63),
  R('v1', 791, 632, 147, 43), R('p1', 948, 632, 147, 43), R('x1', 1105, 632, 147, 43),
  R('v2', 791, 759.5, 147, 43), R('p2', 948, 759.5, 147, 43), R('x2', 1105, 759.5, 147, 43),
  R('party', 1292, 357.5, 460, 72), R('everyone', 1292, 488.4, 460, 70), R('pinRow', 1292, 558.4, 460, 70),
  R('leave', 1292, 652.4, 224, 58), R('end', 1528, 652.4, 224, 58),
]
walk(lobby, 'self', [
  ['left', 'voting'], ['down', 'search'], ['down', 'p1'], ['right', 'x1'], ['right', 'leave'], ['down', 'x2'],
  ['left', 'p2'], ['left', 'v2'], ['down', 'v2'], ['right', 'p2'], ['right', 'x2'], ['up', 'x1'], ['up', 'search'],
  ['up', 'voting'], ['up', 'self'], ['right', 'self'], ['down', 'party'], ['down', 'everyone'], ['down', 'pinRow'],
  ['down', 'leave'], ['down', 'x2'], ['left', 'p2'], ['up', 'p1'],
])

assert.equal(spotlightMove(rooms, 'gone', 'down'), 'close', 'lost focus starts at the first control')
console.log('spotlight.check ok')
