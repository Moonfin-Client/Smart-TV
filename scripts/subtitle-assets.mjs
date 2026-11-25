// Copies the ASS (libass-wasm) worker and its files into public/, so they land next to index.html
// in the build, which is where src/utils/assRenderer.js asks for them. Run it after npm install. The
// ASS fallback font is the app's own Roboto. libpgs needs no worker, since it runs on the main thread.
import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mod = (...p) => join(root, 'node_modules', ...p)
const octopus = (f) => [mod('libass-wasm', 'dist', 'js', f), f]

const ASSETS = [
  octopus('subtitles-octopus-worker.js'),
  octopus('subtitles-octopus-worker-legacy.js'),
  octopus('subtitles-octopus-worker.wasm'),
  [join(root, 'public', 'fonts', 'Roboto-Regular.ttf'), 'ass-fallback-font.ttf'],
]

for (const [src, name] of ASSETS) copyFileSync(src, join(root, 'public', name))
console.log(`[subtitle-assets] copied ${ASSETS.length} files to public/`)
