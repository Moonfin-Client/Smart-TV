// Self-check for feed.js: node src/ui/components/party/feed.check.mjs
import assert from 'node:assert/strict'
import {
  uniqueLines, chatLines, liveReactions, untilNext, waitingFor, secondsLeft, barKeys, barScroll,
  CHAT_MS,
} from './feed.js'

const line = (id, receivedAt, text = 'hi') => ({ id, memberId: 'm', sentAt: 1, text, receivedAt })

const history = [line('a', 0), line('b', 0)]
assert.deepEqual(chatLines(history, 10000, false, true), [], 'history never pops over the video')
assert.deepEqual(chatLines(history, 10000, true, true).map((m) => m.id), ['a', 'b'], 'the open bar shows history')

const chat = [line('a', 0), line('b', 1000), line('c', 5000), line('d', 9000), line('e', 9500)]
assert.deepEqual(chatLines(chat, 10000, false, true).map((m) => m.id), ['c', 'd', 'e'], 'last three, still fresh')
assert.deepEqual(chatLines(chat, 5000 + CHAT_MS, false, true).map((m) => m.id), ['d', 'e'], 'a line goes after six seconds')
assert.deepEqual(chatLines(chat, 10000, false, false), [], 'chat over the video can be off')
assert.deepEqual(chatLines(chat, 10000, true, false).map((m) => m.id), ['c', 'd', 'e'], 'the bar ignores that setting')
assert.equal(chatLines(new Array(9).fill(0).map((_, i) => line(`x${i}`, 0)), 0, true, true).length, 3, 'the bar keeps three')

assert.deepEqual(uniqueLines([line('a', 1, 'one'), line('b', 2), line('a', 3, 'two')]).map((m) => m.text), ['hi', 'two'],
  'a repeated id keeps its newest copy, in its newest place')
const noIds = [{ memberId: 'm', sentAt: 5, text: 'x' }, { memberId: 'm', sentAt: 5, text: 'x' }, { memberId: 'm', sentAt: 6, text: 'x' }]
assert.equal(uniqueLines(noIds).length, 2, 'lines without an id dedupe on sender, time and text')

// Expiry drives the only timer
assert.equal(untilNext([9000 + CHAT_MS, 9500 + CHAT_MS, 9800 + 3000], 10000), 2800, 'the soonest time ahead wins')
assert.equal(untilNext([9000, 15000], 10000), 5000, 'times already past are skipped')
assert.equal(untilNext([], 10000), 0, 'nothing to wait for, no timer')
assert.deepEqual(liveReactions([{ at: 6000 }, { at: 8000 }], 10000), [{ at: 8000 }])

// The ready wait
const room = {
  members: [
    { status: 'ready', connected: true }, { status: 'in_sync', connected: true }, { status: 'joining', connected: true },
    { status: 'joining', connected: false },
  ],
}
assert.equal(waitingFor(room).length, 1, 'only connected members who are not ready hold the start')
assert.equal(secondsLeft(10000, 1), 10)
assert.equal(secondsLeft(10000, 9001), 1)
assert.equal(secondsLeft(10000, 12000), 0)

// The bar's keys start at x 90 on screen, so the divider sits at 678 and Haha at 702, 111 wide.
const replies = ['Haha', 'No way']
const width = (t) => ({ Haha: 53, 'No way': 76 }[t])
const both = barKeys({ reactionsEnabled: true, chatEnabled: true }, replies, 'Type', width)
assert.deepEqual(both.map((k) => k.kind), ['reaction', 'reaction', 'reaction', 'reaction', 'reaction', 'reaction', 'reply', 'reply', 'type'])
assert.equal(both[5].x + both[5].w, 574, 'six reactions end at 664 on screen')
assert.equal(both[6].divider, 588, 'the divider sits 14px on, at 678 on screen')
assert.equal(both[6].x, 612, 'Haha starts at 702 on screen')
assert.equal(both[6].w, 111)
assert.equal(both[8].w, 274, 'Type is 220 wide plus its padding and border')
assert.ok(both.every((k, i) => i === 0 || k.x >= both[i - 1].x + both[i - 1].w), 'keys never overlap')
const chatOnly = barKeys({ reactionsEnabled: false, chatEnabled: true }, replies, 'Type', width)
assert.deepEqual(chatOnly.map((k) => k.kind), ['reply', 'reply', 'type'])
assert.equal(chatOnly[0].x, 0, 'no divider without reactions')
assert.equal(barKeys({ reactionsEnabled: true, chatEnabled: false }, replies, 'Type', width).length, 6)
assert.equal(barScroll(both, 0, 400), 0, 'the start needs no slide')
const last = both[both.length - 1]
assert.equal(barScroll(both, both.length - 1, 400), last.x + last.w - 400, 'the end slides into view')

console.log('feed.check ok')
