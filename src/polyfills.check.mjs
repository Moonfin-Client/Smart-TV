// Runs src/fastPolyfills.js and src/polyfills.js in a fresh context whose built-ins lack what
// Chrome 38 lacks, and checks the stand-ins against the spec's answers. node src/polyfills.check.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// A FontFace whose load settles when told to, to check the faces are held while they load.
const pendingLoads = []
class FakeFace {
  load() {
    return new Promise((resolve) => pendingLoads.push(() => resolve(this)))
  }
}
const ctx = vm.createContext({ FontFace: FakeFace })
vm.runInContext(
  `delete Object.assign; delete Object.entries; delete Object.values; delete Object.fromEntries; delete Array.from;
   delete Array.prototype.find; delete Array.prototype.findIndex; delete Array.prototype.includes;
   delete String.prototype.includes; delete String.prototype.startsWith; delete String.prototype.endsWith;
   delete String.prototype.codePointAt; var window = this;`,
  ctx
)
vm.runInContext(readFileSync(new URL('./fastPolyfills.js', import.meta.url), 'utf8'), ctx)
vm.runInContext(readFileSync(new URL('./polyfills.js', import.meta.url), 'utf8').replace(/^import .*$/m, ''), ctx)
const run = (code) => vm.runInContext(code, ctx)
const json = (code) => JSON.parse(run(`JSON.stringify(${code})`))

assert.deepEqual(json('Object.assign({a: 1}, null, {b: 2}, {a: 3})'), { a: 3, b: 2 })
assert.equal(run('var s = Symbol("k"); var src = {}; src[s] = 4; Object.assign({}, src)[s]'), 4)
assert.equal(run('Object.keys(Object.assign({}, Object.create({inherited: 1}))).length'), 0)
assert.throws(() => run('Object.assign(null)'))
assert.deepEqual(json('Object.entries({x: 1, y: "z"})'), [['x', 1], ['y', 'z']])
assert.deepEqual(json('Object.values({x: 1, y: "z"})'), [1, 'z'])
assert.deepEqual(json('Array.from(new Set([1, 2]))'), [1, 2])
assert.deepEqual(json('Array.from({length: 2}, function (v, i) { return i * 2 })'), [0, 2])
assert.deepEqual(json('Object.fromEntries(new Map([["a", 1]]))'), { a: 1 })
assert.equal(run('[1, 2, 3].find(function (v) { return v > 1 })'), 2)
assert.equal(run('[1, 2, 3].find(function (v) { return v > 5 })'), undefined)
assert.equal(run('[1, 2, 3].findIndex(function (v) { return v === 3 })'), 2)
assert.equal(run('[1, 2, 3].findIndex(function () { return false })'), -1)
assert.equal(run('[1, NaN].includes(NaN)'), true)
assert.equal(run('[1, 2, 3].includes(1, 1)'), false)
assert.equal(run('[1, 2, 3].includes(3, -1)'), true)
assert.equal(run('"moonfin".includes("fin")'), true)
assert.equal(run('"moonfin".includes("fin", 5)'), false)
assert.equal(run('"moonfin".startsWith("moon")'), true)
assert.equal(run('"moonfin".startsWith("fin", 4)'), true)
assert.equal(run('"moonfin".startsWith("x")'), false)
assert.equal(run('"moonfin".endsWith("fin")'), true)
assert.equal(run('"moonfin".endsWith("moon", 4)'), true)
assert.equal(run('"fin".endsWith("moonfin")'), false)
assert.equal(run('"a\\ud83d\\ude00".codePointAt(1)'), 0x1f600)
assert.equal(run('"a\\ud83d\\ude00".codePointAt(2)'), 0xde00)
assert.equal(run('"abc".codePointAt(0)'), 97)
assert.equal(run('"abc".codePointAt(3)'), undefined)
// Non-enumerable, so a for-in over an array or string never meets them.
assert.equal(run('var n = 0; for (var k in []) n++; n'), 0)
// A face's load still answers with the face, and loading the file again (the legacy build runs it
// twice) wraps it only once.
const wrapped = FakeFace.prototype.load
vm.runInContext(`(function () {${readFileSync(new URL('./fastPolyfills.js', import.meta.url), 'utf8')}})()`, ctx)
assert.equal(FakeFace.prototype.load, wrapped)
assert.equal(wrapped.holdsFace, true)
const face = new FakeFace()
const loaded = FakeFace.prototype.load.call(face)
assert.equal(pendingLoads.length, 1)
pendingLoads[0]()
assert.equal(await loaded, face)
console.log('polyfills.check ok')
