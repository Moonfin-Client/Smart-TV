// The update build step. The key pair is made for the run in a temp folder and removed after.
//   node scripts/ota/ota.check.mjs
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OTA_BOOT, applyOta, otaKey, shellHash } from './index.mjs'

const TAGS = {
  modern: '<script src="./assets/index-M.js"></script>',
  legacy:
    '<script id="vite-legacy-polyfill" src="./assets/polyfills-legacy-P.js"></script>' +
    `<script id="vite-legacy-entry" data-src="./assets/index-legacy-E.js">System.import(document.getElementById('vite-legacy-entry').getAttribute('data-src'))</script>`,
}
const FILES = { modern: ['assets/index-M.js'], legacy: ['assets/index-legacy-E.js', 'assets/polyfills-legacy-P.js'] }

const makeDist = (dir, { version = '1.0.0', code = 'a', asset = 'x', page = '<b></b>', de = 'Hallo' } = {}) => {
  mkdirSync(join(dir, 'fonts'), { recursive: true })
  mkdirSync(join(dir, 'assets'), { recursive: true })
  mkdirSync(join(dir, 'resources', 'de'), { recursive: true })
  writeFileSync(join(dir, 'resources', 'de', 'strings.json'), `{"Hello":"${de}"}`)
  writeFileSync(join(dir, 'resources', 'banner.webp'), 'webp')
  mkdirSync(join(dir, 'reader'), { recursive: true })
  writeFileSync(join(dir, 'reader', 'libarchive-worker.js'), 'worker')
  writeFileSync(join(dir, 'subtitles-octopus-worker.wasm'), 'wasm')
  writeFileSync(join(dir, 'index.html'), `<head>${page}</head><body><div id="app"></div>${OTA_BOOT}</body>`)
  writeFileSync(join(dir, 'assets', 'index-M.js'), code)
  writeFileSync(join(dir, 'assets', 'index-legacy-E.js'), 'e' + code)
  writeFileSync(join(dir, 'assets', 'polyfills-legacy-P.js'), 'pp')
  writeFileSync(join(dir, 'assets', 'tick-A.wav'), 'wav')
  writeFileSync(join(dir, 'appinfo.json'), `{"version": "${version}"}`)
  writeFileSync(join(dir, 'icon-80.png'), version)
  writeFileSync(join(dir, 'fonts', 'f.ttf'), asset)
}

const env = (vars) => {
  for (const k of ['MOONFIN_OTA_URL', 'MOONFIN_OTA_PUBLIC_KEY', 'MOONFIN_OTA_SIGNING_KEY']) delete process.env[k]
  Object.assign(process.env, vars)
}

const tmp = mkdtempSync(join(tmpdir(), 'moonfin-ota-'))
try {
  // The shell hash covers only the boot page, the loader, the manifests (without their version), the
  // service and the comic worker. A release that changes code, translations, images, fonts, sounds,
  // the subtitle engine or a new folder applies in-app.
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((n) => join(tmp, n))
  makeDist(a)
  makeDist(b, { version: '1.0.1', code: 'changed', de: 'Guten Tag' })
  mkdirSync(join(b, 'resources', 'fr'))
  writeFileSync(join(b, 'resources', 'fr', 'strings.json'), '{"Hello":"Bonjour"}')
  makeDist(c, { asset: 'changed' })
  makeDist(d, { page: '<i></i>' })
  writeFileSync(join(b, 'index.html'), readFileSync(join(b, 'index.html'), 'utf8').replace('MOONFIN_OTA={}', 'MOONFIN_OTA={"shell":"x"}'))
  assert.equal(shellHash([[a, '']], '1.0.0'), shellHash([[b, '']], '1.0.1'))
  assert.equal(shellHash([[a, '']], '1.0.0'), shellHash([[c, '']], '1.0.0'), 'a font is not shell')
  assert.notEqual(shellHash([[a, '']], '1.0.0'), shellHash([[d, '']], '1.0.0'), 'the boot page is shell')
  writeFileSync(join(c, 'fonts', 'f.ttf'), 'x')
  writeFileSync(join(c, 'assets', 'tick-A.wav'), 'other')
  writeFileSync(join(c, 'subtitles-octopus-worker.wasm'), 'other')
  mkdirSync(join(c, 'extras'))
  writeFileSync(join(c, 'extras', 'new.bin'), 'new')
  assert.equal(shellHash([[a, '']], '1.0.0'), shellHash([[c, '']], '1.0.0'), 'sounds, the subtitle engine and a new folder are not shell')
  writeFileSync(join(d, 'index.html'), readFileSync(join(a, 'index.html')))
  writeFileSync(join(d, 'resources', 'banner.webp'), 'other')
  assert.equal(shellHash([[a, '']], '1.0.0'), shellHash([[d, '']], '1.0.0'), 'an image is not shell')
  writeFileSync(join(d, 'reader', 'libarchive-worker.js'), 'other')
  assert.notEqual(shellHash([[a, '']], '1.0.0'), shellHash([[d, '']], '1.0.0'), 'the comic worker is shell')
  writeFileSync(join(d, 'reader', 'libarchive-worker.js'), 'worker')
  writeFileSync(join(d, 'appinfo.json'), '{"version": "1.0.0", "requiredPermissions": ["more"]}')
  assert.notEqual(shellHash([[a, '']], '1.0.0'), shellHash([[d, '']], '1.0.0'), 'a manifest change is shell')

  // No public key: no loader.
  env({ MOONFIN_OTA_URL: 'http://example.test/ota', MOONFIN_OTA_PUBLIC_KEY: join(tmp, 'missing.pem') })
  assert.equal(otaKey(() => {}), null)
  env({ MOONFIN_OTA_PUBLIC_KEY: join(tmp, 'missing.pem') })
  assert.equal(otaKey(() => {}), null)

  // The loader goes in and the signed release files come out.
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  writeFileSync(join(tmp, 'public.pem'), publicKey.export({ type: 'spki', format: 'pem' }))
  writeFileSync(join(tmp, 'private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }))
  env({ MOONFIN_OTA_URL: 'http://example.test/ota/', MOONFIN_OTA_PUBLIC_KEY: join(tmp, 'public.pem'), MOONFIN_OTA_SIGNING_KEY: join(tmp, 'private.pem') })
  const dist = join(tmp, 'dist')
  const out = join(tmp, 'out')
  makeDist(dist)
  mkdirSync(out)
  const before = shellHash([[dist, '']], '1.0.0')
  const { shell } = applyOta({ dir: dist, platform: 'webos', version: '1.0.0', tags: TAGS, files: FILES, outDir: out, log: () => {} })
  assert.notEqual(shell, before, 'the loader itself is shell')
  assert.equal(shellHash([[dist, '']], '1.0.0'), shell, 'the config is outside the hash')
  const hash16 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)
  const ownAssets = {
    'assets/tick-A.wav': hash16('wav'),
    'fonts/f.ttf': hash16('x'),
    'resources/banner.webp': hash16('webp'),
    'subtitles-octopus-worker.wasm': hash16('wasm'),
  }
  assert.deepEqual(JSON.parse(readFileSync(join(dist, 'ota-assets.json'), 'utf8')), ownAssets, 'the package lists its own assets')
  writeFileSync(join(dist, 'ota-assets.json'), '{}')
  assert.equal(shellHash([[dist, '']], '1.0.0'), shell, 'and that list is outside the hash')
  assert.ok(readFileSync(join(dist, 'ota-loader.js'), 'utf8').includes('__moonfinOta'))

  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const config = JSON.parse(html.match(/<script>window\.MOONFIN_OTA=([^<]*)<\/script><script src="ota-loader\.js"><\/script>/)[1])
  assert.equal(config.url, 'http://example.test/ota')
  assert.equal(config.shell, shell)
  assert.equal(config.key, readFileSync(join(tmp, 'public.pem'), 'utf8').replace(/-----[^-]+-----|\s/g, ''))
  assert.equal(config.boot.modern, TAGS.modern)
  assert.ok(config.boot.legacy.indexOf('System.shouldFetch') < config.boot.legacy.indexOf('vite-legacy-entry'), 'the chunk hook runs before the entry')
  assert.ok(config.boot.legacy.indexOf('vite-legacy-polyfill') < config.boot.legacy.indexOf('System.shouldFetch'), 'and after SystemJS')

  const { payload, sig } = JSON.parse(readFileSync(join(out, 'moonfin-ota-webos.json'), 'utf8'))
  assert.ok(verify('sha256', Buffer.from(payload), publicKey, Buffer.from(sig, 'base64')))
  const m = JSON.parse(payload)
  assert.equal(m.platform, 'webos')
  assert.equal(m.version, '1.0.0')
  assert.equal(m.shell, shell)
  assert.deepEqual(m.files, [
    ['assets/index-M.js', 1],
    ['assets/index-legacy-E.js', 2],
    ['assets/polyfills-legacy-P.js', 2],
    ['assets/tick-A.wav', 3],
    ['fonts/f.ttf', 1],
    ['resources/banner.webp', 4],
    ['resources/de/strings.json', 17],
    ['subtitles-octopus-worker.wasm', 4],
  ])
  assert.deepEqual(m.assets, Object.entries(ownAssets))
  const bin = readFileSync(join(out, 'moonfin-ota-webos.bin'))
  assert.equal(bin.toString(), 'aeappwavxwebp{"Hello":"Hallo"}wasm')
  assert.equal(m.bytes, 34)
  assert.equal(m.sha256, createHash('sha256').update(bin).digest('hex'))
  assert.deepEqual(m.engines.modern, { tags: TAGS.modern, files: FILES.modern })
  assert.equal(m.engines.legacy.tags, config.boot.legacy)
  assert.deepEqual(m.engines.legacy.files, FILES.legacy)

  // Without the signing key the loader still goes in, and no stale release files stay behind.
  env({ MOONFIN_OTA_URL: 'http://example.test/ota', MOONFIN_OTA_PUBLIC_KEY: join(tmp, 'public.pem') })
  const unsigned = join(tmp, 'unsigned')
  makeDist(unsigned)
  applyOta({ dir: unsigned, platform: 'webos', version: '1.0.0', tags: TAGS, files: FILES, outDir: out, log: () => {} })
  assert.ok(readFileSync(join(unsigned, 'index.html'), 'utf8').includes('"shell"'))
  assert.deepEqual(readdirSync(out), [])

  // A second run on the same page would find no stand-in to fill.
  assert.throws(() => applyOta({ dir: dist, platform: 'webos', version: '1.0.0', tags: TAGS, files: FILES, outDir: out, log: () => {} }), /stand-in/)
} finally {
  env({})
  rmSync(tmp, { recursive: true, force: true })
}
console.log('ota build ok')
