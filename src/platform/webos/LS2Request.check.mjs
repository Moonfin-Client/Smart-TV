// A one-shot call is answered once and let go, a subscription keeps its bridge, and the newer
// WebOSServiceBridge is taken over PalmServiceBridge. node src/platform/webos/LS2Request.check.mjs
import assert from 'node:assert/strict'

const made = []
class FakeBridge {
  constructor() {
    made.push(this)
    this.canceled = false
  }
  call(uri, params) {
    this.uri = uri
    this.params = JSON.parse(params)
  }
  cancel() {
    this.canceled = true
  }
}
globalThis.window = { PalmServiceBridge: FakeBridge }
const { default: LS2Request } = await import('./LS2Request.js')

const got = []
new LS2Request().send({ service: 'luna://com.webos.service.db/', method: 'find', parameters: { a: 1 }, onSuccess: (r) => got.push(r.n) })
assert.equal(made[0].uri, 'luna://com.webos.service.db/find')
made[0].onservicecallback('{"returnValue":true,"n":1}')
assert.deepEqual(got, [1])
assert.equal(made[0].canceled, true)

const failed = []
new LS2Request().send({ service: 'luna://x', method: 'y', onFailure: (e) => failed.push(e.errorText) })
made[1].onservicecallback('{"returnValue":false,"errorText":"denied"}')
assert.deepEqual(failed, ['denied'])

const sub = new LS2Request().send({ service: 'luna://x', method: 'z', subscribe: true, onSuccess: (r) => got.push(r.n) })
assert.equal(made[2].params.subscribe, true)
made[2].onservicecallback('{"n":2}')
made[2].onservicecallback('{"n":3}')
assert.deepEqual(got, [1, 2, 3])
assert.equal(made[2].canceled, false)
sub.cancel()
assert.equal(made[2].canceled, true)

class Newer extends FakeBridge {}
window.WebOSServiceBridge = Newer
new LS2Request().send({ service: 'luna://x', method: 'y' })
assert.ok(made[3] instanceof Newer)

delete window.WebOSServiceBridge
delete window.PalmServiceBridge
const none = []
new LS2Request().send({ service: 'luna://x', method: 'y', onFailure: (e) => none.push(e.returnValue) })
assert.deepEqual(none, [false])
console.log('LS2Request ok')
