// Copies the ASS subtitle engines and their files into public/, so they land next to index.html
// in the build, which is where src/utils/assRenderer.js asks for them. Run it after npm install. The
// ASS fallback font is the app's own Roboto. libpgs needs no worker, since it runs on the main thread.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mod = (...p) => join(root, 'node_modules', ...p)
const octopus = (f) => [mod('libass-wasm', 'dist', 'js', f), f]
const jassub = (f) => [mod('jassub', 'dist', ...f.split('/')), f.replace(/^wasm\//, '')]

const ASSETS = [
  octopus('subtitles-octopus-worker.js'),
  octopus('subtitles-octopus-worker-legacy.js'),
  octopus('subtitles-octopus-worker.wasm'),
  jassub('wasm/jassub-worker.wasm'),
  jassub('wasm/jassub-worker-modern.wasm'),
  [mod('jassub', 'dist', 'default.woff2'), 'jassub-default.woff2'],
  [join(root, 'public', 'fonts', 'Roboto-Regular.ttf'), 'ass-fallback-font.ttf'],
]

// Jassub creates a module worker. TV apps load from file:// and their older engines only run
// classic workers, and the bundled worker is classic for the same reason.
const main = mod('jassub', 'dist', 'jassub.js')
let source = readFileSync(main, 'utf8')
const moduleWorker = "{ name: 'jassub-worker', type: 'module' }"
if (source.includes(moduleWorker)) source = source.replace(moduleWorker, "{ name: 'jassub-worker' }")
else if (source.includes("type: 'module'")) throw new Error('jassub changed its worker options, update scripts/subtitle-assets.mjs')

// Moonfin passes every file explicitly and stores those files beside index.html. Pointing the
// fallbacks there too keeps Vite from treating Jassub's own copy of them as application assets.
const patchMain = (from, to, label) => {
  if (source.includes(from)) source = source.replace(from, to)
  else if (!source.includes(to)) throw new Error(`jassub changed ${label}, update scripts/subtitle-assets.mjs`)
}
patchMain("new URL('./worker/worker.js', import.meta.url)", "new URL('jassub-worker.js', document.baseURI)", 'worker URL')
patchMain("new URL('./wasm/jassub-worker-modern.wasm', import.meta.url).href", "new URL('jassub-worker-modern.wasm', document.baseURI).href", 'modern WASM URL')
patchMain("new URL('./wasm/jassub-worker.wasm', import.meta.url).href", "new URL('jassub-worker.wasm', document.baseURI).href", 'WASM URL')
patchMain("new URL('./wasm/jassub-worker-modern.js', import.meta.url).href", "new URL('jassub-worker.js#modern', document.baseURI).href", 'modern worker URL')
patchMain("new URL('./wasm/jassub-worker.js', import.meta.url).href", "new URL('jassub-worker.js#normal', document.baseURI).href", 'worker glue URL')
patchMain("new URL('./default.woff2', import.meta.url).href", "new URL('jassub-default.woff2', document.baseURI).href", 'default font URL')
writeFileSync(main, source)
console.log('[subtitle-assets] patched jassub for classic file:// workers')

// worker.js loads the emscripten glue with a dynamic import. A classic worker cannot import(),
// so scripts/jassub-worker-entry.js supplies jassubLoadWasmGlue() instead.
const GLUE_IMPORT = /await import\(\s*(?:__rewriteRelativeImportExtension\()?\s*(?:\/\*[^*]*\*\/\s*)*data\.wasmWorkerUrl\s*\)\)?/
// The glue's own copy of its asset address is import.meta syntax, which a classic worker can't parse.
// worker.js overrides fetch() with the configured wasm URL, so this address is never really used.
const META_URL = /new URL\(\s*"[^"]+"\s*,\s*import\.meta\.url\s*\)/g
// The pthreads of the threaded build are classic workers too. TV builds are normally single-threaded,
// but this keeps them usable where cross-origin isolation is available.
const MODULE_PTHREAD = /type:\s*["']module["'],?\s*/g

const patchJassubWorker = () => ({
  name: 'moonfin:jassub-classic-worker',
  enforce: 'pre',
  transform(code, id) {
    const path = id.replace(/\\/g, '/')
    if (path.endsWith('/jassub/dist/worker/worker.js')) {
      if (!GLUE_IMPORT.test(code)) throw new Error('jassub worker.js changed, update scripts/subtitle-assets.mjs')
      return { code: code.replace(GLUE_IMPORT, 'await self.jassubLoadWasmGlue(data.wasmWorkerUrl)'), map: null }
    }
    if (/\/jassub\/dist\/wasm\/jassub-worker(-modern)?\.js$/.test(path)) {
      return { code: code.replace(META_URL, 'self.location.href').replace(MODULE_PTHREAD, ''), map: null }
    }
  },
})

const outDir = mod('.cache', 'moonfin-jassub-worker')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
await build({
  configFile: false,
  logLevel: 'silent',
  root,
  plugins: [patchJassubWorker()],
  build: {
    outDir,
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    lib: {
      entry: join(root, 'scripts', 'jassub-worker-entry.js'),
      formats: ['iife'],
      name: 'MoonfinJassubWorker',
      fileName: () => 'jassub-worker.js',
    },
  },
})

copyFileSync(join(outDir, 'jassub-worker.js'), join(root, 'public', 'jassub-worker.js'))
for (const [src, name] of ASSETS) copyFileSync(src, join(root, 'public', name))
console.log(`[subtitle-assets] copied ${ASSETS.length + 1} files to public/`)
