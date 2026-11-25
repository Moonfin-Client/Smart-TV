// node src/ui/components/previews/playerLayout.check.mjs
import assert from 'node:assert/strict'
import { playerMoment, controlsFloor, pictureBox } from './playerLayout.js'
import { bottomLayout } from '../player/osdLayout.js'

const base = { subtitleMode: 'default' }
const mid = playerMoment('middle', base)
assert.equal(mid.controls, true)
assert.equal(mid.focus, 'button')
assert.equal(mid.progress, 0.42)
assert.equal(playerMoment('intro', base).skip, 'intro')
assert.equal(playerMoment('intro', { introAction: 'auto' }).skip, null)
assert.equal(playerMoment('intro', { introAction: 'auto' }).progress, 0.15)
assert.equal(playerMoment('outro', { replaceSkipOutroWithNextUp: true }).card.countdown, null)
assert.equal(playerMoment('end', { autoPlay: true, nextUpTimeout: 0 }).card, null)
assert.equal(playerMoment('end', { autoPlay: true }).card.countdown, 7)
assert.equal(playerMoment('end', {}).controls, false)
assert.equal(playerMoment('airDate', { showNextAirDate: false }).card, null)
assert.equal(playerMoment('paused', { showDescriptionOnPause: true }).subtitles, false)
assert.equal(playerMoment('seek', { trickPlayMode: 'disabled' }).paused, false)
assert.equal(playerMoment('watching', { playerZoomMode: 'stretch' }).fit, 'autoCrop')
assert.deepEqual(pictureBox('fit'), { x: 0, y: 69, w: 960, h: 402, scaleY: 1 })

// Both time rows, as measured on screen: the row over the bar starts at 892 and the bar at 931, so
// the subtitle's floor is 200 px up.
const both = bottomLayout({ live: false, above: true, below: true, buttons: true })
assert.equal(both.top + 24, 892)
assert.equal(both.barY, 931)
assert.ok(Math.abs(controlsFloor(both) - (200 / 1080) * 100) < 1e-9)
// Without the row over the bar, the thumb is the highest point.
const below = bottomLayout({ live: false, above: false, below: true, buttons: true })
assert.ok(Math.abs(controlsFloor(below) - ((1080 - below.barY + 7.5) / 1080 + 12 / 1080) * 100) < 1e-9)
console.log('playerLayout ok')
