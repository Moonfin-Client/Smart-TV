// Checks the lazy shader program patch in scripts/patch-renderer.mjs: a program compiles on its
// first draw, once, and one that fails draws nothing without trying again.
//   node scripts/lazyShaders.check.mjs
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = process.env.PATCH_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const { WebGlShaderProgram } = await import(join(root, 'node_modules/@solidtv/renderer/dist/src/core/renderers/webgl/WebGlShaderProgram.js'))

const fakeGl = (linkOk = true) => {
  const calls = { compile: 0, use: [], lost: 0 }
  const glw = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    canUseVertexArrayObject: false,
    createShader: () => ({}),
    shaderSource() {},
    compileShader: () => calls.compile++,
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({ program: true }),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => linkOk,
    getProgramInfoLog: () => 'link failed',
    deleteShader() {},
    deleteProgram() {},
    getAttributeLocations: () => ['a_position'],
    getUniformLocations: () => ({ u_alpha: 1 }),
    getExtension: () => ({}),
    isContextLost: () => false,
    useProgram: (p) => calls.use.push(p),
    disableVertexAttribArray() {},
  }
  const renderer = { glw, stage: { setContextLost: () => calls.lost++ } }
  return { glw, calls, renderer }
}
const config = { vertex: 'void main() {}', fragment: 'void main() {}' }
const quiet = console.warn
console.warn = () => {}
const quietErr = console.error
console.error = () => {}

// Created, it compiles nothing, and already knows how it batches.
const a = fakeGl()
const p = new WebGlShaderProgram(a.renderer, { ...config, canBatch: undefined }, {})
assert.equal(p.program, null)
assert.equal(a.calls.compile, 0)
assert.deepEqual(p.lifecycle, { update: undefined, canBatch: undefined })
// Batching asks it first, which compiles it with the real fields, and attaching uses it as is.
const shared = { uniforms: {} }
assert.equal(p.reuseRenderOp({ worldAlpha: 1, props: { shader: shared } }, { worldAlpha: 1, shader: shared }), true)
// A batch it would have joined before it compiled is refused on the fields it compiled with.
assert.equal(p.reuseRenderOp({ worldAlpha: 0.5, props: { shader: shared } }, { worldAlpha: 1, shader: shared }), false)
assert.equal(a.calls.compile, 2)
assert.equal(p.useSystemAlpha, true)
assert.deepEqual(p.attributeLocations, ['a_position'])
p.attach()
assert.equal(a.calls.compile, 2)
assert.deepEqual(a.calls.use, [p.program])

// Attaching compiles one nothing batched with yet.
const b = fakeGl()
const q = new WebGlShaderProgram(b.renderer, config, {})
q.attach()
assert.equal(b.calls.compile, 2)
assert.deepEqual(b.calls.use, [q.program])

// A program that fails to link draws nothing, and doesn't try again on the next frame.
const c = fakeGl(false)
const r = new WebGlShaderProgram(c.renderer, config, {})
r.attach()
r.bindRenderOp({ renderOpTexture: null }, {})
r.attach()
r.detach()
assert.equal(c.calls.compile, 2)
assert.deepEqual(c.calls.use, [null, null])
assert.equal(r.program, null)

console.warn = quiet
console.error = quietErr
console.log('lazyShaders.check ok')
