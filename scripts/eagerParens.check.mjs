// node scripts/eagerParens.check.mjs
import assert from 'node:assert/strict'
import { eagerParens } from './eagerParens.mjs'

const same = (src) => assert.equal(eagerParens(src), src)

assert.equal(eagerParens('!function(){var a=1}();'), '!(function(){var a=1})();')
assert.equal(eagerParens('var C=function(){function C(){}return C}();'), 'var C=(function(){function C(){}return C})();')
assert.equal(eagerParens('function(){}.call(this);'.replace(/^/, 'x=')), 'x=(function(){}).call(this);')
same('(function(){})();')
same('var f=function(){};f();')
same('a.then(function(e){return e});')

const chunk =
  '!function(){System.register(["./a.js"],function(e,t){"use strict";var a;return{setters:[function(e){a=e.a}],execute:function(){e("b",function(){return a}())}}})}();'
assert.equal(
  eagerParens(chunk),
  '!(function(){System.register(["./a.js"],(function(e,t){"use strict";var a;return{setters:[function(e){a=e.a}],execute:(function(){e("b",(function(){return a})())})}}))})();'
)
// A second pass finds nothing left to wrap.
same(eagerParens(chunk))
// Output stays valid ES5 and runs the same.
const run = (src) => {
  const out = []
  new Function('out', src)(out)
  return out
}
const prog = 'out.push(function(){return 1}());var o={execute:function(){return 2}};out.push(o.execute());out.push(function(a){return a}.call(null,3));'
assert.deepEqual(run(eagerParens(prog)), run(prog))
console.log('eagerParens ok')
