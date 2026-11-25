// Self-check for getBackdropTag and the tagged media bar backdrop in helpers.js: node src/utils/backdropTag.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// helpers.js names its imports without extensions, which the bundler resolves and Node doesn't.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx)
  },
})
const { getBackdropTag, getFeaturedBackdropUrl } = await import('./helpers.js')

const S = 'http://jf'
// The item's own backdrop, else its parent's, each with the tag of the picture it names.
const movie = { Id: 'm', BackdropImageTags: ['b0', 'b1'] }
const episode = { Id: 'e', BackdropImageTags: [], ParentBackdropItemId: 's', ParentBackdropImageTags: ['p0'] }
assert.equal(getBackdropTag(movie), 'b0')
assert.equal(getBackdropTag(episode), 'p0')
assert.equal(getBackdropTag({ Id: 'x' }), undefined)
assert.equal(getBackdropTag(null), undefined)
assert.equal(getFeaturedBackdropUrl(S, movie, { maxWidth: 1920, quality: 85 }), 'http://jf/Items/m/Images/Backdrop?maxWidth=1920&quality=85&tag=b0')
assert.equal(getFeaturedBackdropUrl(S, episode, { maxWidth: 480 }), 'http://jf/Items/s/Images/Backdrop?maxWidth=480&tag=p0')
// An outside list's title keeps its own address.
assert.equal(getFeaturedBackdropUrl(S, { _external: true, _externalBackdropUrl: 'https://t/x.jpg' }, {}), 'https://t/x.jpg')
console.log('backdropTag ok')
