// Checks the texture patches in scripts/patch-renderer.mjs. Uploads take the textures shown on
// screen first (a full screen picture before the rest, and textures nothing holds last). Below the
// critical line the cleanup frees only textures no node holds, and over it the ones no node holds
// go before the held ones.
//   node scripts/textureHolders.check.mjs
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = process.env.PATCH_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const core = join(root, 'node_modules/@solidtv/renderer/dist/src/core/')
const { CoreTextureManager } = await import(core + 'CoreTextureManager.js')
const { TextureMemoryManager } = await import(core + 'TextureMemoryManager.js')
const { TextureType } = await import(core + 'textures/Texture.js')

const IN_VIEWPORT = 8
const IN_BOUNDS = 4
// Each texture something holds, unless `held` says nothing does.
const tex = (name, node, held = 1) => ({ name, shownBy: node, renderableOwners: { size: held } })
const queueOf = (list, head = 0) => ({ list, head, membership: new Set(list.slice(head)), get size() { return this.membership.size } })
const order = (q) => q.list.slice(q.head).filter((t) => q.membership.has(t)).map((t) => t.name)

// On screen textures, and ones held with no node of their own (a font atlas), go first, the rest
// keep their order after them.
const onScreen = { renderState: IN_VIEWPORT, props: { w: 300, h: 450 } }
const margin = { renderState: IN_BOUNDS, props: { w: 300, h: 450 } }
const fullScreen = { renderState: IN_VIEWPORT, props: { w: 1920, h: 1080 } }
const q = queueOf([tex('card1', margin), tex('logo', onScreen), tex('card2', margin), tex('atlas', null), tex('backdrop', onScreen)])
CoreTextureManager.prototype.onScreenFirst.call({ uploadTextureQueue: q })
assert.deepEqual(order(q), ['logo', 'atlas', 'backdrop', 'card1', 'card2'])
assert.equal(q.head, 0)
// Entries already taken or dropped from the queue stay out.
const taken = tex('taken', onScreen)
const dropped = tex('dropped', onScreen)
const q2 = queueOf([taken, tex('a', margin), dropped, tex('b', onScreen)], 1)
q2.membership.delete(dropped)
CoreTextureManager.prototype.onScreenFirst.call({ uploadTextureQueue: q2 })
assert.deepEqual(order(q2), ['b', 'a'])
// A backdrop that finished loading last still goes up first, even with nothing off screen waiting.
const q3 = queueOf([tex('logo', onScreen), tex('cast', onScreen), tex('backdrop', fullScreen)])
CoreTextureManager.prototype.onScreenFirst.call({ uploadTextureQueue: q3 })
assert.deepEqual(order(q3), ['backdrop', 'logo', 'cast'])
// A texture no node shows and nothing holds any more (card art or a preload let go while it loaded)
// waits behind what's on screen.
const q5 = queueOf([tex('dropped', null, 0), tex('card', onScreen), tex('atlas', null), tex('preload', margin)])
CoreTextureManager.prototype.onScreenFirst.call({ uploadTextureQueue: q5 })
assert.deepEqual(order(q5), ['card', 'atlas', 'dropped', 'preload'])
// Off screen, a full screen picture waits its turn with the rest.
const q4 = queueOf([tex('logo', onScreen), tex('far', { renderState: IN_BOUNDS, props: { w: 1920, h: 1080 } })])
CoreTextureManager.prototype.onScreenFirst.call({ uploadTextureQueue: q4 })
assert.deepEqual(order(q4), ['logo', 'far'])

// Below the critical line a texture a node still holds stays, and over it, it goes too.
const image = (name, attached, memUsed) => ({ name, type: TextureType.image, attached, memUsed, canBeCleanedUp: () => true })
const cleanupWith = (critical, textures) => {
  const freed = []
  const mm = {
    criticalCleanupRequested: critical,
    criticalThreshold: 100,
    targetThreshold: 10,
    memUsed: textures.reduce((n, t) => n + t.memUsed, 0),
    loadedTextures: new Set(textures),
    stage: { queueFrameEvent() {} },
    freeTexture(t) {
      freed.push(t.name)
      this.loadedTextures.delete(t)
      this.memUsed -= t.memUsed
    },
    evictOrphanedTextures() {},
  }
  TextureMemoryManager.prototype.cleanup.call(mm, false)
  return freed
}
const kinds = (size) => [image('held', 1, size), image('gone', 0, size)]
assert.deepEqual(cleanupWith(false, kinds(40)), ['gone'])
assert.deepEqual(cleanupWith(true, kinds(120)), ['gone', 'held'])
// Over it, letting the unheld one go can be enough, and the held one stays.
assert.deepEqual(cleanupWith(true, kinds(60)), ['gone'])
console.log('textureHolders.check ok')
