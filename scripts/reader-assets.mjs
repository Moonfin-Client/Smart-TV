// Copies the book reader libraries into public/reader. Run it after npm install. The readers load
// them next to the page when a book opens, so they stay out of the startup bundle and out of the
// ES5 rewrite the legacy build does on dist/assets.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mod = (...p) => join(root, 'node_modules', ...p)

const ASSETS = [
  [mod('epubjs', 'dist', 'epub.legacy.min.js'), 'epub.legacy.min.js'],
  [mod('epubjs', 'license'), 'epubjs-LICENSE.txt'],
  [mod('pdfjs-dist', 'es5', 'build', 'pdf.min.js'), 'pdf.min.js'],
  [mod('pdfjs-dist', 'es5', 'build', 'pdf.worker.min.js'), 'pdf.worker.min.js'],
  [mod('pdfjs-dist', 'LICENSE'), 'pdfjs-LICENSE.txt'],
  [mod('libarchive.js', 'dist', 'worker-bundle.js'), 'libarchive-worker.js'],
  [mod('libarchive.js', 'dist', 'wasm-gen', 'libarchive.wasm'), 'wasm-gen/libarchive.wasm'],
  [mod('libarchive.js', 'LICENSE'), 'libarchive-LICENSE.txt'],
]

for (const [src, name] of ASSETS) {
  const dest = join(root, 'public', 'reader', name)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
}
console.log(`[reader-assets] copied ${ASSETS.length} files to public/reader`)
