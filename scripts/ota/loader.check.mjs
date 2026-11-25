// The update loader's boot paths, each launch a fresh page over the same storage: a fresh install,
// a download, booting from storage on both bundles, a bad version, no room, a reinstall, a stored
// copy that fails to read, and images and fonts an update replaces. Also the SystemJS chunk hook.
// The key pair is made for the run.
//   node scripts/ota/loader.check.mjs
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse } from 'acorn'

const LOADER = readFileSync(new URL('./loader.js', import.meta.url), 'utf8')
const HOOK = readFileSync(new URL('./systemFetch.js', import.meta.url), 'utf8')
// Both run as they are on Chrome 38.
for (const src of [LOADER, HOOK]) parse(src, { ecmaVersion: 5, sourceType: 'script' })
const URL_BASE = 'http://ota.test'
const SHELL = 'shell-a'
const flush = () => new Promise((r) => setTimeout(r, 5))
const settle = async () => {
  for (let i = 0; i < 20; i++) await flush()
}

// Storage that outlives a page: localStorage, IndexedDB (text counts two bytes a character, bytes
// as they are) and the release server.
const local = new Map()
const dbs = new Map()
const deleted = []
const server = new Map()
const blobs = new Map()
let quota = Infinity
const size = (v) => (typeof v === 'string' ? 2 * v.length : v.byteLength)
const usage = () => [...dbs.values()].reduce((n, m) => n + [...m.values()].reduce((a, v) => a + size(v), 0), 0)
const hash16 = (data) => createHash('sha256').update(data).digest('hex').slice(0, 16)

const inRange = (range, key) => {
  if (typeof range === 'string') return key === range
  if ('upper' in range) return range.upperOpen ? key < range.upper : key <= range.upper
  return range.lowerOpen ? key > range.lower : key >= range.lower
}
const request = (fill) => {
  const r = {}
  setImmediate(() => {
    r.result = fill()
    if (r.onsuccess) r.onsuccess()
  })
  return r
}
const transaction = (data, mode) => {
  const copy = new Map(data)
  const tx = { error: null }
  const store = {
    get: (k) => request(() => copy.get(k)),
    put: (v, k) => copy.set(k, v),
    delete: (range) => [...copy.keys()].forEach((k) => inRange(range, k) && copy.delete(k)),
    clear: () => copy.clear(),
  }
  tx.objectStore = () => store
  setTimeout(() => {
    if (mode === 'readwrite') {
      const others = usage() - [...data.values()].reduce((a, v) => a + size(v), 0)
      if (others + [...copy.values()].reduce((a, v) => a + size(v), 0) > quota) {
        tx.error = { name: 'QuotaExceededError' }
        return tx.onabort()
      }
      data.clear()
      for (const [k, v] of copy) data.set(k, v)
    }
    if (tx.oncomplete) tx.oncomplete()
  }, 1)
  return tx
}
const indexedDB = {
  open(name) {
    const r = {}
    setImmediate(() => {
      const fresh = !dbs.has(name)
      if (fresh) dbs.set(name, new Map())
      const data = dbs.get(name)
      r.result = { transaction: (s, mode) => transaction(data, mode), createObjectStore() {}, close() {} }
      if (fresh && r.onupgradeneeded) r.onupgradeneeded()
      r.onsuccess()
    })
    return r
  },
  deleteDatabase(name) {
    deleted.push(name)
    dbs.delete(name)
  },
}
const IDBKeyRange = {
  upperBound: (upper, upperOpen) => ({ upper, upperOpen: !!upperOpen }),
  lowerBound: (lower, lowerOpen) => ({ lower, lowerOpen: !!lowerOpen }),
}
// The stored file names, leaving out each version's list of replaced package files.
const stored = () => [...(dbs.get('moonfin_update') || new Map()).keys()].filter((k) => !k.endsWith('/@files')).sort()

class XHR {
  open(method, url) {
    this.url = url
  }
  send() {
    setImmediate(() => {
      const body = server.get(this.url)
      // A package file comes over file://, which answers with status 0 on Chrome 38.
      this.status = body === undefined ? 404 : /^https?:/.test(this.url) ? 200 : 0
      if (body !== undefined) {
        const buf = Buffer.from(body)
        this.response = this.responseType === 'arraybuffer' ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) : buf.toString()
        if (this.onprogress) this.onprogress({ loaded: buf.length })
      }
      this.onload()
    })
  }
}

// Script tags as the loader's div parses them.
const parseTags = (html) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(([, attrs, text]) => {
    const attributes = [...attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value = '']) => ({ name, value }))
    return { attributes, text, getAttribute: (n) => (attributes.find((a) => a.name === n) || { value: null }).value }
  })

// One page load: the boot page's probe result, then the loader.
const PACKAGE_FILES = new Set(['./assets/index-M1.js', './assets/poly-legacy1.js'])
const TAGS = {
  modern: '<script src="./assets/index-M1.js"></script>',
  legacy:
    '<script id="vite-legacy-polyfill" src="./assets/poly-legacy1.js"></script>' +
    '<script id="vite-legacy-entry" data-src="./assets/entry-legacy1.js">System.import(1)</script>',
}
const launch = ({ version = '1.0.0', modern = false, key } = {}) => {
  const page = { written: [], ran: [], held: 0, warnings: [], intervals: [] }
  const app = { firstChild: null }
  const body = {
    appendChild(el) {
      el.parentNode = body
      if (el.tag === 'script') {
        page.ran.push(el)
        if (el.src) setImmediate(() => (PACKAGE_FILES.has(el.src) ? el.onload() : el.onerror()))
      }
    },
    removeChild(el) {
      el.parentNode = null
    },
  }
  const createElement = (tag) => {
    if (tag === 'iframe')
      return { style: {}, contentDocument: { open: () => page.held++, close: () => page.held-- } }
    const el = { tag, attrs: {}, text: '', setAttribute: (n, v) => (el.attrs[n] = v) }
    if (tag === 'div')
      Object.defineProperty(el, 'innerHTML', { set: (html) => (el.scripts = parseTags(html)) })
    el.getElementsByTagName = () => el.scripts
    return el
  }
  const ctx = {
    MOONFIN_OTA: { platform: 'webos', version, shell: SHELL, url: URL_BASE, key, boot: TAGS },
    __moonfinModern: modern ? 1 : undefined,
    localStorage: {
      getItem: (k) => (local.has(k) ? local.get(k) : null),
      setItem: (k, v) => local.set(k, String(v)),
      removeItem: (k) => local.delete(k),
    },
    indexedDB,
    IDBKeyRange,
    navigator: { webkitTemporaryStorage: { queryUsageAndQuota: (ok) => ok(usage(), quota) } },
    document: { write: (s) => page.written.push(s), body, head: body, createElement, getElementById: (id) => (id === 'app' ? app : null) },
    XMLHttpRequest: XHR,
    Blob,
    URL: {
      createObjectURL: (blob) => {
        const url = `blob:${blobs.size + 1}`
        blobs.set(url, blob)
        return url
      },
    },
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    atob,
    console: { warn: (m) => page.warnings.push(m), log() {} },
    setInterval: (fn) => page.intervals.push(fn),
    clearInterval: () => (page.intervals.length = 0),
    setTimeout: () => {},
  }
  ctx.window = ctx
  vm.runInNewContext(LOADER, ctx)
  page.ota = ctx.__moonfinOta
  page.bundle = ctx.__moonfinBundle
  page.draw = () => {
    app.firstChild = {}
    page.intervals.slice().forEach((fn) => fn())
  }
  page.inline = () => page.ran.filter((s) => !s.src).map((s) => s.text)
  return page
}

// A signed release as CI writes it, its files named for the version.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KEY = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
const publish = (version, { shell = SHELL, platform = 'webos', tag = version, tamper = false, assets = [] } = {}) => {
  const v = version.replace(/\./g, '')
  const own = assets.slice().sort((x, y) => (x[0] < y[0] ? -1 : 1))
  const files = [
    [`assets/entry-legacy${v}.js`, `legacy entry ${version}`],
    [`assets/index-M${v}.js`, `modern ${version} café …`],
    [`assets/poly-legacy${v}.js`, `legacy polyfills ${version}`],
    ...own,
    ['resources/de/strings.json', `{"Hello":"Hallo ${version}"}`],
    ['resources/fr/strings.json', `{"Hello":"Bonjour ${version}"}`],
  ]
  const bin = Buffer.concat(files.map((f) => Buffer.from(f[1])))
  const engines = {
    modern: { tags: `<script src="./assets/index-M${v}.js"></script>`, files: [`assets/index-M${v}.js`] },
    legacy: {
      tags:
        `<script id="vite-legacy-polyfill" src="./assets/poly-legacy${v}.js"></script><script>hook()</script>` +
        `<script id="vite-legacy-entry" data-src="./assets/entry-legacy${v}.js">System.import(2)</script>`,
      files: [`assets/entry-legacy${v}.js`, `assets/poly-legacy${v}.js`],
    },
  }
  const files2 = files.map((f) => [f[0], Buffer.byteLength(f[1])])
  const payload = JSON.stringify({
    platform,
    version,
    shell,
    bytes: bin.length,
    sha256: createHash('sha256').update(bin).digest('hex'),
    files: files2,
    assets: own.map(([name, data]) => [name, hash16(data)]),
    engines,
  })
  const sig = sign('sha256', Buffer.from(payload), privateKey).toString('base64')
  server.set(`${URL_BASE}/${tag}/moonfin-ota-webos.json`, JSON.stringify({ payload, sig }))
  server.set(`${URL_BASE}/${tag}/moonfin-ota-webos.bin`, tamper ? Buffer.concat([bin, Buffer.from('x')]) : bin)
}
const reset = () => {
  local.clear()
  dbs.clear()
  deleted.length = 0
  quota = Infinity
}
const fetchUpdate = async (page, version) => {
  const m = await page.ota.check(version)
  assert.ok(m, `${version} is offered`)
  const seen = []
  await page.ota.download(m, (p) => seen.push(p))
  assert.equal(seen[seen.length - 1], 1)
  return m
}

publish('1.1.0')
publish('1.2.0')
publish('1.3.0', { shell: 'shell-b' })
publish('1.4.0', { platform: 'tizen' })
publish('1.5.0', { tag: '1.5.1' })
publish('1.6.0', { tamper: true })

// A fresh install boots its own legacy bundle and drops any database.
{
  const page = launch({ key: KEY })
  assert.deepEqual(page.written, [TAGS.legacy])
  assert.equal(page.bundle, 'legacy')
  assert.equal(page.ota.read, undefined)
  assert.deepEqual(deleted, ['moonfin_update'])
  assert.equal(local.get('moonfin_update_installed'), '1.0.0')
  assert.equal(page.ota.ready(), null)

  // Only a release built for this exact shell and platform, at its own tag, and newer.
  assert.equal(await page.ota.check('1.3.0'), null, 'another shell')
  assert.equal(await page.ota.check('1.4.0'), null, 'another platform')
  assert.equal(await page.ota.check('1.5.1'), null, 'a manifest from another tag')
  assert.equal(await page.ota.check('9.9.9'), null, 'no release files')
  server.set(`${URL_BASE}/1.7.0/moonfin-ota-webos.json`, server.get(`${URL_BASE}/1.1.0/moonfin-ota-webos.json`).replace('1.1.0', '1.7.0'))
  assert.equal(await page.ota.check('1.7.0'), null, 'a payload that lost its signature')
  const bad = await page.ota.check('1.6.0')
  await assert.rejects(page.ota.download(bad), /integrity/)
  assert.equal(page.ota.ready(), null)

  // The download keeps only the legacy bundle and the tags that boot it.
  await fetchUpdate(page, '1.1.0')
  assert.deepEqual(stored(), ['1.1.0/assets/entry-legacy110.js', '1.1.0/assets/poly-legacy110.js', '1.1.0/boot'])
  assert.equal(page.ota.ready(), '1.1.0')
  assert.equal(await page.ota.check('1.1.0'), null, 'already ready')
}

// The next launch boots it from storage, holding the load event until the app draws.
{
  const page = launch({ key: KEY })
  await settle()
  assert.deepEqual(page.written, [])
  assert.deepEqual(page.inline(), ['legacy polyfills 1.1.0', 'hook()', 'System.import(2)'])
  const entry = page.ran[2]
  assert.equal(entry.attrs.id, 'vite-legacy-entry')
  assert.equal(entry.attrs['data-src'], './assets/entry-legacy110.js')
  assert.equal(page.ran[0].attrs.src, undefined)
  assert.equal(await page.ota.read('assets/entry-legacy110.js'), 'legacy entry 1.1.0')
  assert.equal(local.get('moonfin_update_pending'), '1.1.0 1')
  assert.equal(page.held, 1)
  page.draw()
  assert.equal(local.get('moonfin_update_pending'), undefined)
  assert.equal(page.held, 0)
}

// With room for both, the running copy stays until the new one boots.
{
  const page = launch({ key: KEY })
  await settle()
  page.draw()
  await fetchUpdate(page, '1.2.0')
  assert.deepEqual(stored(), [
    '1.1.0/assets/entry-legacy110.js',
    '1.1.0/assets/poly-legacy110.js',
    '1.1.0/boot',
    '1.2.0/assets/entry-legacy120.js',
    '1.2.0/assets/poly-legacy120.js',
    '1.2.0/boot',
  ])
  const next = launch({ key: KEY })
  await settle()
  assert.deepEqual(next.inline(), ['legacy polyfills 1.2.0', 'hook()', 'System.import(2)'])
  assert.deepEqual(stored(), ['1.2.0/assets/entry-legacy120.js', '1.2.0/assets/poly-legacy120.js', '1.2.0/boot'], 'the old copy goes once the new one boots')
  next.draw()
}

// Two launches in a row that never draw make the version bad, and the third boots the package.
{
  reset()
  await fetchUpdate(launch({ key: KEY }), '1.1.0')
  const first = launch({ key: KEY })
  await settle()
  assert.equal(local.get('moonfin_update_pending'), '1.1.0 1')
  const second = launch({ key: KEY })
  await settle()
  assert.equal(local.get('moonfin_update_pending'), '1.1.0 2')
  assert.deepEqual(second.inline()[0], 'legacy polyfills 1.1.0')
  const third = launch({ key: KEY })
  assert.deepEqual(third.written, [TAGS.legacy])
  assert.equal(local.get('moonfin_update_bad'), '1.1.0')
  assert.equal(third.ota.ready(), null)
  assert.equal(await third.ota.check('1.1.0'), null, 'a bad version is not offered again')
  assert.ok(await third.ota.check('1.2.0'), 'a newer one is')
  void first
}

// One launch that never draws, then one that does, keeps the version.
{
  reset()
  await fetchUpdate(launch({ key: KEY }), '1.1.0')
  launch({ key: KEY })
  await settle()
  const drawn = launch({ key: KEY })
  await settle()
  drawn.draw()
  const after = launch({ key: KEY })
  await settle()
  assert.equal(after.inline()[0], 'legacy polyfills 1.1.0')
  assert.equal(local.get('moonfin_update_bad'), undefined)
}

// No room for two copies: the download drops the running one first.
{
  reset()
  await fetchUpdate(launch({ key: KEY }), '1.1.0')
  const page = launch({ key: KEY })
  await settle()
  page.draw()
  quota = usage() + 10
  deleted.length = 0
  await fetchUpdate(page, '1.2.0')
  assert.deepEqual(deleted, ['moonfin_update'])
  assert.deepEqual(stored(), ['1.2.0/assets/entry-legacy120.js', '1.2.0/assets/poly-legacy120.js', '1.2.0/boot'])
  assert.equal(page.ota.ready(), '1.2.0')
}

// No room even for one: the download fails and nothing is left ready.
{
  reset()
  const page = launch({ key: KEY })
  quota = 10
  const m = await page.ota.check('1.1.0')
  await assert.rejects(page.ota.download(m))
  assert.equal(page.ota.ready(), null)
  assert.deepEqual(launch({ key: KEY }).written, [TAGS.legacy])
}

// A newly installed package replaces a stored update, even an older package.
{
  reset()
  await fetchUpdate(launch({ key: KEY }), '1.2.0')
  const page = launch({ key: KEY, version: '1.1.5' })
  assert.deepEqual(page.written, [TAGS.legacy])
  assert.equal(page.ota.ready(), null)
}

// A stored copy that fails to read falls back to the package's bundle, loaded in order.
{
  reset()
  await fetchUpdate(launch({ key: KEY }), '1.1.0')
  dbs.get('moonfin_update').delete('1.1.0/assets/poly-legacy110.js')
  const page = launch({ key: KEY })
  await settle()
  assert.deepEqual(page.written, [])
  assert.deepEqual(
    page.ran.map((s) => s.src || s.text),
    ['./assets/poly-legacy1.js', 'System.import(1)'],
    'none of the stored scripts ran'
  )
  assert.equal(page.ran[1].attrs.id, 'vite-legacy-entry')
  assert.equal(page.ota.read, undefined)
  assert.equal(page.ota.ready(), null)
  assert.ok(page.warnings.some((w) => /failed to load/.test(w)))
}

// Translations ride in the release. The download keeps only the app's language (with its fallback
// chain), a stored boot reads that language from storage through i18n.js, and a language that
// wasn't stored comes from the package without failing.
{
  reset()
  const page = launch({ key: KEY })
  const m = await page.ota.check('1.1.0')
  await page.ota.download(m, null, ['resources/de-AT/strings.json', 'resources/de/strings.json'])
  assert.deepEqual(stored(), ['1.1.0/assets/entry-legacy110.js', '1.1.0/assets/poly-legacy110.js', '1.1.0/boot', '1.1.0/resources/de/strings.json'])
  const next = launch({ key: KEY })
  await settle()
  next.draw()

  const PACKAGE = { 'resources/de/strings.json': '{"Hello":"Hallo (package)"}', 'resources/fr/strings.json': '{"Hello":"Bonjour (package)"}' }
  globalThis.XMLHttpRequest = class {
    open(method, url) {
      this.url = url
    }
    send() {
      setImmediate(() => {
        this.responseText = PACKAGE[this.url] || ''
        this.onload()
      })
    }
  }
  globalThis.window = { __moonfinOta: next.ota }
  const i18n = await import('../../src/services/i18n.js')
  await i18n.loadStrings('de-AT')
  assert.equal(i18n.default('Hello'), 'Hallo 1.1.0', 'the stored boot gets the release strings')
  assert.deepEqual(i18n.stringFiles(), ['resources/de-AT/strings.json', 'resources/de/strings.json'])
  await i18n.loadStrings('fr')
  assert.equal(i18n.default('Hello'), 'Bonjour (package)', 'a language that was not stored falls back to the package')
  await i18n.loadStrings('es')
  assert.equal(i18n.default('Hello'), 'Hello', 'and one the package lacks is English')
  globalThis.window = { __moonfinOta: { read: () => Promise.resolve('{broken') } }
  await i18n.loadStrings('de')
  assert.equal(i18n.default('Hello'), 'Hallo (package)', 'an unreadable stored copy falls back too')
  globalThis.window = { __moonfinOta: { ready: () => null } }
  await i18n.loadStrings('de')
  assert.equal(i18n.default('Hello'), 'Hallo (package)', 'a package boot reads its own')
  delete globalThis.window
  delete globalThis.XMLHttpRequest
}

// Images and fonts ride in the release too. The download stores only the ones that differ from the
// package's own (its ota-assets.json), as bytes, and a stored boot hands each to the app as a blob URL.
{
  reset()
  const A = Buffer.from([0x89, 0x50, 0x00, 0xff, 0x10])
  const B1 = Buffer.from([1, 2, 3])
  const B2 = Buffer.from([0xff, 0xfe, 0x00, 0x80])
  // Not valid UTF-8, so a text decode would change it.
  const C = Buffer.from([0xc3, 0x28, 0xa0])
  publish('1.8.0', { assets: [['icons/a.webp', A], ['icons/b.webp', B2], ['fonts/c.ttf', C]] })
  server.set('ota-assets.json', JSON.stringify({ 'icons/a.webp': hash16(A), 'icons/b.webp': hash16(B1) }))
  await fetchUpdate(launch({ key: KEY }), '1.8.0')
  assert.deepEqual(stored(), ['1.8.0/assets/entry-legacy180.js', '1.8.0/assets/poly-legacy180.js', '1.8.0/boot', '1.8.0/fonts/c.ttf', '1.8.0/icons/b.webp'])
  assert.deepEqual(JSON.parse(dbs.get('moonfin_update').get('1.8.0/@files')), ['fonts/c.ttf', 'icons/b.webp'])
  const next = launch({ key: KEY })
  await settle()
  assert.deepEqual(next.inline()[0], 'legacy polyfills 1.8.0')
  assert.deepEqual(Object.keys(next.ota.files).sort(), ['fonts/c.ttf', 'icons/b.webp'])
  const image = blobs.get(next.ota.files['icons/b.webp'])
  assert.equal(image.type, 'image/webp')
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), B2)
  const font = blobs.get(next.ota.files['fonts/c.ttf'])
  assert.equal(font.type, 'font/ttf')
  assert.deepEqual(Buffer.from(await font.arrayBuffer()), C)
  next.draw()

  // assetUrl() gives the stored copy for a package path or a full URL into the package, which is how
  // the bundles name the files they import, and the package's own file for anything else.
  globalThis.window = { __moonfinOta: next.ota }
  globalThis.document = { baseURI: 'file:///media/apps/moonfin/index.html#/home' }
  const { assetUrl } = await import('../../src/utils/assetUrl.js')
  assert.equal(assetUrl('icons/b.webp'), next.ota.files['icons/b.webp'])
  assert.equal(assetUrl('./icons/b.webp'), next.ota.files['icons/b.webp'])
  assert.equal(assetUrl('file:///media/apps/moonfin/fonts/c.ttf'), next.ota.files['fonts/c.ttf'])
  assert.equal(assetUrl('icons/a.webp'), 'icons/a.webp')
  assert.equal(assetUrl('https://server/icons/b.webp'), 'https://server/icons/b.webp')
  delete globalThis.window
  delete globalThis.document
  assert.equal(assetUrl('icons/b.webp'), 'icons/b.webp', 'and the path where there is no loader')

  // A package without its own list stores every asset, and a stored asset that can't be read sends
  // the launch back to the package.
  server.delete('ota-assets.json')
  reset()
  await fetchUpdate(launch({ key: KEY }), '1.8.0')
  assert.deepEqual(stored().filter((k) => !k.includes('/assets/') && !k.endsWith('/boot')), ['1.8.0/fonts/c.ttf', '1.8.0/icons/a.webp', '1.8.0/icons/b.webp'])
  dbs.get('moonfin_update').delete('1.8.0/icons/b.webp')
  const broken = launch({ key: KEY })
  await settle()
  assert.equal(broken.ota.files, undefined)
  assert.deepEqual(broken.ran.map((s) => s.src || s.text), ['./assets/poly-legacy1.js', 'System.import(1)'])
}

// The modern bundle: only its one script is stored, decoded as UTF-8, and it boots inline.
{
  reset()
  const page = launch({ key: KEY, modern: true })
  assert.deepEqual(page.written, [TAGS.modern])
  assert.equal(page.bundle, 'modern')
  await fetchUpdate(page, '1.1.0')
  assert.deepEqual(stored(), ['1.1.0/assets/index-M110.js', '1.1.0/boot'])
  const next = launch({ key: KEY, modern: true })
  await settle()
  assert.deepEqual(next.inline(), ['modern 1.1.0 café …'])
  next.draw()
}

// The chunk hook sends a stored release's SystemJS fetches to storage and stays out of the way otherwise.
{
  const run = (ota, readyState = 'complete') => {
    const listeners = {}
    const ctx = {
      __moonfinOta: ota,
      System: {},
      location: { href: 'file:///media/apps/moonfin/index.html#/home' },
      document: { readyState, addEventListener: (n, fn) => (listeners[n] = fn) },
      Promise,
    }
    ctx.window = ctx
    vm.runInNewContext(HOOK, ctx)
    return { System: ctx.System, listeners }
  }
  assert.equal(run({}).System.fetch, undefined)
  const { System } = run({ read: (name) => Promise.resolve(`text of ${name}`) })
  assert.ok(System.shouldFetch('file:///media/apps/moonfin/assets/Details-legacy-X.js'))
  assert.ok(!System.shouldFetch('http://elsewhere/assets/x.js'))
  const res = await System.fetch('file:///media/apps/moonfin/assets/Details-legacy-X.js')
  assert.ok(res.ok)
  assert.equal(res.headers.get('content-type'), 'application/javascript')
  assert.equal(await res.text(), 'text of assets/Details-legacy-X.js')

  // Nothing evaluates while the page still parses.
  const parsing = run({ read: () => Promise.resolve('x') }, 'loading')
  let done = false
  parsing.System.fetch('file:///media/apps/moonfin/assets/a.js').then(() => (done = true))
  await settle()
  assert.equal(done, false)
  parsing.listeners.DOMContentLoaded()
  await settle()
  assert.equal(done, true)
}
console.log('ota loader ok')
