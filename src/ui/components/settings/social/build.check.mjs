// Self-check for build.js: node src/ui/components/settings/social/build.check.mjs
// The heights and places are the achievement and friends screens' measured values at 1920x1080.
import assert from 'node:assert/strict'
import * as B from './build.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.6, `${msg}: ${a} vs ${b}`)

// A badge row: shell, title, description and its unlock date, rarity and points on the end.
const badge = B.cardRow({
  sid: 'b',
  lead: { kind: 'tile' },
  lines: [{ kind: 'heading', text: 'First Watch' }, { kind: 'caption', text: 'Finish your first movie' }, { kind: 'note', text: 'Unlocked' }],
  trail: { kind: 'stack', top: 'Common', bottom: '10 pts' },
})
near(badge.card.h, 123.52, 'a badge row')
near(badge.h, 123.52 + 13.36, 'with its margins')
near(badge.card.lines[0].x, 169.81 - 53.42 - 20.03, 'its body starts after the 48px shell and its 20px gap')
near(badge.card.lines[0].y, 590.56 - 573.73, 'its lines sit centered in the 56 unit body')

// One still to unlock adds its slim bar and count, and grows past the body's minimum.
const locked = B.cardRow({
  sid: 'l',
  lead: { kind: 'tile' },
  lines: [{ kind: 'heading', text: 'Film Buff' }, { kind: 'caption', text: 'Watch 50 movies' }, { kind: 'bar', slim: true, value: 0.64 }, { kind: 'note', text: '32 / 50' }],
  trail: { kind: 'stack', top: 'Rare', bottom: '35 pts' },
})
near(locked.card.h, 137.88, 'a badge row with progress')
near(locked.card.lines[2].y - locked.card.lines[1].y, 23.47 + 10, 'the bar sits 10 under the description')

// A person: the 56px avatar and a chevron. A leaderboard row: the rank number and the score.
const person = B.cardRow({ sid: 'p', lead: { kind: 'avatar', letter: 'A' }, lines: [{ kind: 'heading', text: 'Ava' }], trail: { kind: 'chevron' } })
near(person.card.lines[0].x, 177.8 - 73.45, 'a person row body')
const board = B.cardRow({ sid: 'r', lead: { kind: 'gutter', text: '1' }, lines: [{ kind: 'heading', text: 'Ava' }], trail: { kind: 'text', size: 28, text: '910' } })
near(board.card.lines[0].x, 173.81 - 73.45, 'a leaderboard row body')

// The blocks around the rows.
near(B.message('m', 'Loading...').h, 113, 'a message')
near(B.progress('p', '280 points').h, 57, 'a score bank')
near(B.progress('p', '32 / 50', { value: 0.5 }).h, 67, 'a progress figure with its bar')
near(B.tabBar('t', [{ id: 'a', label: 'All', sid: 'a' }], 'a', 0, () => false, () => {}).h, 82.98, 'a tab bar')
near(B.showcase('s', [], 0, () => false).h, 152.97, 'a showcase')
near(B.watchClock('c', { 20: 20 }).h, 114.98, 'a watch clock')
near(B.inputField('i', { sid: 'i' }).h, 99.75 + 13.36, 'a field without a label')
near(B.inputField('i', { sid: 'i', label: 'Group name' }).h, 146.09 + 13.36, 'a field with its label')
near(B.actionBar('a', [{ sid: 'x', label: 'Decline' }, { sid: 'y', label: 'Accept' }], true).h, 149.92, 'two stacked action buttons')
near(B.statChips('s', ['a']).h, 64.97, 'the profile stats')

// The rank header: tier, bar, note, then the two rows of summary chips.
const rank = B.rankHeader('r', { name: 'x' }, [{ label: '4 of 9 badges' }, { label: '44.4%' }, { label: '3 day streak' }, { label: 'Best: 12 days' }])
assert.ok(rank.h > 8 + 88 + 18 + 10 + 10 + 33 + 20 + 49 + 20, 'the rank header holds its chips')

// The tab bar keeps the focused tab in view by the least it can move.
const tabs = 'abcdefgh'.split('').map((id) => ({ id, label: 'Episodes', sid: id }))
assert.equal(B.tabScroll(tabs, 'a', 0, 0), 0, 'the first tab needs no scroll')
assert.ok(B.tabScroll(tabs, 'a', 0, 7) > 0, 'the last of eight long tabs scrolls the bar')
assert.equal(B.tabScroll(tabs, 'a', 300, 0), 20, 'going back left reveals the first tab inside the bar padding')

// A color at an alpha.
assert.equal(B.tint('#2196F3', 0.18), '#2196f32e')
assert.equal(B.tint('nonsense', 1), '#00a4dcff')

console.log('build.js ok')
