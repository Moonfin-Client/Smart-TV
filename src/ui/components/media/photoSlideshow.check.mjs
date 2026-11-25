// node src/ui/components/media/photoSlideshow.check.mjs
import assert from 'node:assert/strict'
import { bottomBar, canStartSlideshow, moreCount, stepIndex, viewerItems } from './photoSlideshow.js'

const P = (Id) => ({ Id, Type: 'Photo' })
const V = (Id) => ({ Id, Type: 'Video' })
const list = [P('a'), V('b'), P('c')]

assert.deepEqual(viewerItems([P('a'), { Id: 'f', Type: 'Folder' }, V('b')], null).map((i) => i.Id), ['a', 'b'])
assert.deepEqual(viewerItems([], P('x')).map((i) => i.Id), ['x'])
assert.equal(stepIndex(list, 0, 1), 1)
assert.equal(stepIndex(list, 0, 1, true), 2)
assert.equal(stepIndex(list, 0, -1), 2)
assert.equal(stepIndex([V('v')], 0, 1, true), 0)
assert.equal(canStartSlideshow(list, 0, true), true)
assert.equal(canStartSlideshow(list, 1, true), false)
assert.equal(canStartSlideshow([P('a'), V('b')], 0, false), false)
assert.equal(moreCount({ loaded: 10, total: 10 }, 0, 4), 0)
assert.equal(moreCount({ loaded: 5, total: 10 }, 0, 4), 5)
assert.equal(moreCount({ loaded: 5, total: 10 }, 4, 4), 1)

// At 1920x1080: a photo with the button and hint, and a video with its date and hint.
const photo = bottomBar({ button: true, hint: true })
assert.deepEqual([photo.top, photo.at.name, photo.at.button, photo.at.hint], [869, 899, 938, 1017])
const video = bottomBar({ date: true, hint: true })
assert.deepEqual([video.top, video.at.name, video.at.date, video.at.hint], [905, 935, 974, 1017])
console.log('photoSlideshow ok')
