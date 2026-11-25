// node scripts/patch-renderer.check.mjs
// Every patch in patch-renderer.mjs is in node_modules, and the patched text layout cuts and clamps
// as CSS does.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const run = spawnSync(process.execPath, [join(here, 'patch-renderer.mjs')], { env: { ...process.env, PATCH_CHECK: '1' }, encoding: 'utf8' })
assert.equal(run.status, 0, run.stderr)

const root = process.env.PATCH_ROOT || join(here, '..')
const { wrapText, truncateLineEnd } = await import(join(root, 'node_modules/@solidtv/renderer/dist/src/core/text-rendering/TextLayoutEngine.js'))
// Every character 10 wide, the ellipsis too, and the "r," pair kerned 3 narrower.
const measure = (text) => text.length * 10 - 3 * (text.split('r,').length - 1)
const lines = (text, maxWidth, maxLines) => wrapText(measure, text, 'f', maxWidth, 0, '…', 'break-word', maxLines)[0].map((l) => l[0])

// The last line cuts at the character that fits, not the word.
assert.deepEqual(lines('Batman and Harley Quinn', 200, 1), ['Batman and Harley Q…'])
// A single line keeps a space it cut after, a clamped last line drops it.
assert.deepEqual(lines('cccccccc dd', 100, 1), ['cccccccc …'])
assert.deepEqual(lines('aaaa bbbb cccccccc dd', 100, 2), ['aaaa bbbb', 'cccccccc…'])
// A cut character takes its kerning with it: "power" is 50 wide here, so with the ellipsis it
// overflows 58 and loses its r.
assert.equal(truncateLineEnd(measure, 'f', 0, 'power,x', measure('power,x'), '', 58, '…', 10)[0], 'powe…')

// A quad clear of the box around every waiting text is answered without checking each one, and the
// answer is the one checking each would give. Coordinates on a 10px grid land on shared edges often.
const { WebGlRenderer } = await import(join(root, 'node_modules/@solidtv/renderer/dist/src/core/renderers/webgl/WebGlRenderer.js'))
const { noteText, coversText } = WebGlRenderer.prototype
let seed = 7
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed % n
}
const grid = (n) => rand(n) * 10
const bound = (x, y, w, h) => ({ x1: x, y1: y, x2: x + w, y2: y + h })
const plain = {}
const gl = { pendingText: [], pendingTextLen: 0, pendingX1: 0, pendingY1: 0, pendingX2: 0, pendingY2: 0, stage: { defShaderNode: plain } }
for (let round = 0; round < 400; round++) {
  gl.pendingTextLen = 0
  for (let k = 1 + rand(6); k > 0; k--) noteText.call(gl, { renderBound: bound(grid(192), grid(108), grid(40), grid(6)), textProps: { fontSize: 20 * (1 + rand(3)) } })
  for (let q = 0; q < 60; q++) {
    const shader = rand(3) === 0 ? { shaderKey: 'shadow' } : rand(2) ? plain : { shaderKey: 'rounded' }
    const b = bound(grid(220) - 140, grid(130) - 110, grid(60), grid(40))
    const g = shader.shaderKey === 'shadow' ? 128 : 0
    const a = gl.pendingText
    let each = false
    for (let i = 0; i < gl.pendingTextLen; i += 4) {
      if (b.x1 - g < a[i + 2] && b.x2 + g > a[i] && b.y1 - g < a[i + 3] && b.y2 + g > a[i + 1]) each = true
    }
    assert.equal(coversText.call(gl, { renderBound: b, props: { shader } }), each)
  }
}
console.log('patch-renderer ok')
