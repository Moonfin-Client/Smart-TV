import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import legacy from '@vitejs/plugin-legacy'
import { transformSync } from '@babel/core'
import { minify } from 'terser'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { eagerParens } from './scripts/eagerParens.mjs'

// PLATFORM picks the platform module set (webos, tizen, vega, xbox). TARGET picks the bundle:
// - legacy: SystemJS ES5 bundle for Chrome 38 and up (webOS 3 to 22, Tizen 3 to 6.5).
// - modern: one classic-script bundle for Chrome 94 and up (Tizen 7+). TV apps load from file://,
//   where Chrome refuses module scripts, so it can't be an ES module.
const platform = process.env.PLATFORM || 'webos'
const modern = process.env.TARGET === 'modern'
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const src = (p) => resolve(import.meta.dirname, 'src', p)

const shared = {
  base: './',
  define: {
    'process.env.REACT_APP_PLATFORM': JSON.stringify(platform),
    'process.env.REACT_APP_VERSION': JSON.stringify(pkg.version),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    // The renderer's build flags. Left undefined they stay runtime checks and their code ships.
    __DEV__: false,
    __enableInspector__: false,
    __emitBoundsEvents__: false,
    __enableCompressedTextures__: false,
    // On by default, it draws every SDF text after everything else in the frame, so page text shows
    // through the open sidebar. The app's layering needs text drawn in tree order.
    __renderTextBatching__: false,
  },
  resolve: {
    alias: [
      { find: /^@moonfin\/app\/src\//, replacement: `${src('')}/` },
      { find: /^@moonfin\/platform-(webos|tizen|vega|xbox)/, replacement: `${src('platform')}/$1` },
    ],
    dedupe: ['solid-js', '@solidtv/solid', '@solidtv/renderer', '@solidjs/router'],
  },
}

// JSX compiles to @solidtv/solid's universal renderer, not the DOM one.
const solidPlugin = solid({ solid: { moduleName: '@solidtv/solid', generate: 'universal', builtIns: [] } })

// core-js puts a Symbol.prototype[@@toPrimitive] on Chrome 38 that throws "Incompatible
// receiver", so it has to go after the polyfills load and before the app chunk runs.
const chrome38Fix = {
  name: 'chrome38-symbol-fix',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html.replace('</body>', '<script>try{delete Symbol.prototype[Symbol.toPrimitive]}catch(e){}</script></body>'),
  },
}

// setComputedProperties writes { [key]: value } as a plain store. Babel's defineProperty helper for
// it, with its Symbol.toPrimitive probe per key, was about 2% of launch on webOS 3 on its own.
const BABEL_ASSUMPTIONS = { setPublicClassFields: true, privateFieldsAsProperties: true, setSpreadProperties: true, setComputedProperties: true }

// Rolldown's runtime helpers use arrows and its minifier emits template literals even in
// the legacy chunks, and Chrome 38 parses neither. One Babel pass over the written files
// brings them to ES5 syntax, then terser minifies (oxc's minified legacy output breaks
// core-js's Symbol on Chrome 38). Last, every function that runs as its chunk loads gets back
// the parentheses terser drops: Chrome 38 compiles a function eagerly only right after a "(", so
// each SystemJS chunk was otherwise parsed up to four times (scripts/eagerParens.mjs).
const es5Output = {
  name: 'es5-output',
  apply: 'build',
  async writeBundle(options) {
    const dir = join(options.dir, 'assets')
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      const file = join(dir, f)
      const out = transformSync(readFileSync(file, 'utf8'), {
        babelrc: false,
        configFile: false,
        compact: true,
        comments: false,
        sourceType: 'script',
        assumptions: BABEL_ASSUMPTIONS,
        presets: [['@babel/preset-env', { targets: 'chrome 38', modules: false, useBuiltIns: false }]],
      })
      const min = process.env.NOMIN
        ? { code: out.code }
        : await minify(out.code, { ecma: 5, safari10: true, compress: { passes: 2 } })
      writeFileSync(file, eagerParens(min.code))
    }
  },
}

const classicScript = {
  name: 'classic-script',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(/<script type="module" crossorigin src=/g, '<script defer src='),
  },
}

const legacyConfig = {
  ...shared,
  plugins: [
    solidPlugin,
    legacy({
      targets: ['chrome >= 38'],
      renderModernChunks: false,
      // Usage detection pulls in ~140 core-js modules, and on Chrome 38 most of them replace native
      // Symbol, Map, Set, Promise, typed arrays and Array methods with slower JS ones. Only add what
      // Chrome 38 is missing. Object.assign, entries and values, Array.from, find, findIndex and
      // includes, String includes, startsWith, endsWith and codePointAt, and Object.fromEntries come
      // from src/fastPolyfills.js, loaded with these below: core-js runs every call through generic
      // wrappers, and those were the hot spots of the launch profile on webOS 3.
      polyfills: [
        'es.object.get-own-property-descriptors',
        'es.array.fill', 'es.array.flat', 'es.array.flat-map',
        'es.array.unscopables.flat', 'es.array.unscopables.flat-map',
        'es.array.find-last', 'es.array.find-last-index', 'es.array.at',
        'es.string.pad-start',
        'es.string.pad-end', 'es.string.repeat', 'es.string.trim-start',
        'es.string.trim-end', 'es.string.replace-all', 'es.string.at-alternative', 'es.string.from-code-point',
        'es.number.is-finite', 'es.number.is-integer', 'es.number.is-nan', 'es.number.parse-float',
        'es.number.parse-int', 'es.math.trunc', 'es.math.sign',
        'es.reflect.construct', 'es.reflect.get', 'es.reflect.set', 'es.reflect.own-keys',
        'es.typed-array.fill', 'es.typed-array.find', 'es.typed-array.find-index', 'es.typed-array.every',
        'es.typed-array.filter', 'es.typed-array.copy-within', 'es.typed-array.from',
        'es.global-this',
        // The router ranks its routes with sort, and V8 before 7.0 sorts arrays over 10 items unstably.
        'es.array.sort',
        'web.queue-microtask', 'web.dom-collections.iterator', 'web.dom-collections.for-each',
        'web.url', 'web.url-search-params',
      ],
      additionalLegacyPolyfills: ['whatwg-fetch', src('fastPolyfills.js')],
      // Plain assignment for class fields and object spread instead of a defineProperty per key.
      assumptions: BABEL_ASSUMPTIONS,
    }),
    chrome38Fix,
    es5Output,
  ],
  build: {
    minify: false,
    modulePreload: { polyfill: false },
    outDir: `dist/${platform}-legacy`,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: { transform: { assumptions: { setPublicClassFields: true } } },
  },
}

const modernConfig = {
  ...shared,
  plugins: [solidPlugin, classicScript],
  build: {
    // chrome98 keeps class fields native. Below it oxc turns every field into a defineProperty
    // helper call, and the renderer's nodes would make tens of thousands of those per key press.
    // The output has no syntax newer than Chrome 94 (Tizen 7).
    target: 'chrome98',
    minify: process.env.NOMIN ? false : 'oxc',
    modulePreload: { polyfill: false },
    outDir: `dist/${platform}-modern`,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { format: 'iife', codeSplitting: false } },
  },
  // An IIFE finds its assets from its own script tag's src, which only exists while that tag runs
  // and not at all for a release the update loader runs inline. Sounds that load later, like
  // AfterHours', would resolve beside index.html and miss. Asset URLs count from the page instead.
  experimental: {
    renderBuiltUrl: (file, { hostType }) => (hostType === 'js' ? { runtime: `new URL(${JSON.stringify(file)}, document.baseURI).href` } : undefined),
  },
}

export default defineConfig(modern ? modernConfig : legacyConfig)
