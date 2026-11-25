// Combines a sample legacy and modern index.html and runs the boot script both ways.
//   node scripts/bootPage.check.mjs
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { bootTags, combine, MODERN_PROBE } from './bootPage.mjs'

const legacyHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <script>window.early = 1</script>


  </head>
  <body>
    <div id="app"></div>
    <script nomodule crossorigin id="vite-legacy-polyfill" src="./assets/polyfills-legacy-A.js"></script>
    <script nomodule crossorigin id="vite-legacy-entry" data-src="./assets/index-legacy-B.js">System.import(document.getElementById('vite-legacy-entry').getAttribute('data-src'))</script>
  <script>try{delete Symbol.prototype[Symbol.toPrimitive]}catch(e){}</script></body>
</html>
`
const modernHtml = `<html><head><script defer src="./assets/index-C.js"></script></head><body><div id="app"></div></body></html>`

const html = combine(legacyHtml, modernHtml, { headFirst: '<script src="$WEBAPIS/webapis/webapis.js"></script>' })
assert.ok(html.indexOf('webapis.js') < html.indexOf(MODERN_PROBE), 'webapis first, then the probe')
assert.ok(html.indexOf(MODERN_PROBE) < html.indexOf('window.early'), "the probe runs before the page's own scripts")
assert.ok(!/crossorigin|nomodule|defer/.test(html))
assert.ok(!/\n\s*\n/.test(html), 'no blank lines left')

// The one inline script holding both tag sets.
const boot = html.match(/<script>(\(function\(\)\{var m=[\s\S]*?)<\/script>/)
assert.ok(boot, 'boot script present')
assert.ok(!/<\/script/i.test(boot[1]), 'no close tag inside the boot script')

const run = (modern) => {
  const written = []
  const window = modern ? { __moonfinModern: 1 } : {}
  vm.runInNewContext(boot[1], { window, document: { write: (s) => written.push(s) } })
  return { written: written.join(''), bundle: window.__moonfinBundle }
}
const m = run(true)
assert.equal(m.bundle, 'modern')
assert.equal(m.written, '<script src="./assets/index-C.js"></script>')
const l = run(false)
assert.equal(l.bundle, 'legacy')
assert.equal(
  l.written,
  '<script id="vite-legacy-polyfill" src="./assets/polyfills-legacy-A.js"></script>' +
    `<script id="vite-legacy-entry" data-src="./assets/index-legacy-B.js">System.import(document.getElementById('vite-legacy-entry').getAttribute('data-src'))</script>` +
    '<script>try{delete Symbol.prototype[Symbol.toPrimitive]}catch(e){}</script>'
)

// The probe itself: this Node parses static blocks, so the flag is set.
const probe = {}
vm.runInNewContext(MODERN_PROBE.replace(/<\/?script>/g, ''), { window: probe })
assert.equal(probe.__moonfinModern, 1)

// A package with the update loader gets its stand-in instead of the boot script, and the same head.
const withLoader = combine(legacyHtml, modernHtml, { boot: '<script src="ota-loader.js"></script>' })
assert.ok(withLoader.includes('<div id="app"></div>\n    <script src="ota-loader.js"></script>'))
assert.ok(!withLoader.includes('__moonfinBundle'))
assert.equal(withLoader.indexOf(MODERN_PROBE), html.indexOf(MODERN_PROBE) - '<script src="$WEBAPIS/webapis/webapis.js"></script>'.length)
assert.deepEqual(bootTags(legacyHtml, modernHtml), { modern: m.written, legacy: l.written })

assert.throws(() => combine(legacyHtml.replaceAll('vite-legacy-entry', 'x'), modernHtml), /SystemJS entry/)
assert.throws(() => combine(legacyHtml, modernHtml.replace('defer ', '')), /one deferred bundle/)
console.log('bootPage ok')
