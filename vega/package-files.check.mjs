// Runs inject/package-files.js in a fake file:///pkg/assets page and checks that packaged files
// answer XHR (by responseType), fetch and the image worker, and that other URLs go through.
//   node vega/package-files.check.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('./inject/package-files.js', import.meta.url), 'utf8')
const PACKED = {
  'fonts/a.msdf.json': [0, '{"chars":[1]}'],
  'icons/star.png': [1, Buffer.from([137, 80, 78, 71]).toString('base64')],
}

const opened = []
class FakeXHR extends EventTarget {
  open(method, url) { opened.push(url) }
  send() { this.realSent = true }
}
const posted = []
class FakeWorker {
  postMessage(message) { posted.push(message) }
}
const win = {
  location: { protocol: 'file:', href: 'file:///pkg/assets/index.html#/home' },
  URL, Blob, Response, TextEncoder, TextDecoder, Uint8Array, Promise, Object, Array, JSON, Error,
  atob, btoa, unescape, encodeURIComponent, decodeURIComponent,
  ProgressEvent: class extends Event {},
  XMLHttpRequest: FakeXHR,
  Worker: FakeWorker,
  fetch: async (url) => ({ passed: url }),
  document: {
    createElement: () => ({ remove() {} }),
    head: {
      appendChild(script) {
        const name = decodeURIComponent(script.src.replace(/^vega-files\//, '').replace(/\.js$/, ''))
        setTimeout(() => (PACKED[name] ? (win.__moonfinVegaFile(name, ...PACKED[name]), script.onload()) : script.onerror()), 0)
      },
    },
  },
}
win.window = win
vm.runInNewContext(source, win)

const xhr = (url, type) =>
  new Promise((resolve) => {
    const x = new win.XMLHttpRequest()
    x.responseType = type
    x.addEventListener('load', () => resolve(x))
    x.open('GET', url, true)
    x.send(null)
  })

const json = await xhr('fonts/a.msdf.json', 'json')
assert.equal(json.status, 200)
assert.deepEqual(json.response, { chars: [1] })
const text = await xhr('file:///pkg/assets/fonts/a.msdf.json', '')
assert.equal(text.responseText, '{"chars":[1]}')
const blob = await xhr('icons/star.png', 'blob')
assert.equal(blob.response.type, 'image/png')
assert.equal((await blob.response.arrayBuffer()).byteLength, 4)
const missing = await xhr('resources/fr/strings.json', '')
assert.equal(missing.status, 404)

const network = new win.XMLHttpRequest()
network.open('GET', 'http://jellyfin.example:8096/System/Info', true)
network.send()
assert.equal(network.realSent, true)
assert.deepEqual(opened, ['http://jellyfin.example:8096/System/Info'])

assert.equal((await win.fetch('https://example.org/x')).passed, 'https://example.org/x')
assert.equal((await win.fetch('icons/star.png')).status, 200)
assert.equal((await win.fetch('icons/none.png')).status, 404)

const worker = new win.Worker('blob:null/1')
worker.postMessage({ init: true })
worker.postMessage({ id: 1, src: 'file:///pkg/assets/icons/star.png' })
worker.postMessage({ id: 2, src: 'http://jellyfin.example:8096/Items/x/Images/Primary' })
await new Promise((r) => setTimeout(r, 10))
assert.equal(posted[0].init, true)
assert.equal(posted.find((m) => m.id === 1).src, 'data:image/png;base64,iVBORw==')
assert.equal(posted.find((m) => m.id === 2).src, 'http://jellyfin.example:8096/Items/x/Images/Primary')
console.log('package-files ok')
