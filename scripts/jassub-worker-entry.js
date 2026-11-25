// Bundled into one classic worker by scripts/subtitle-assets.mjs. The two emscripten glue modules
// sit in the same file, so the worker never needs a module import or a second script to start.
import normalGlue from 'jassub/dist/wasm/jassub-worker.js'
import modernGlue from 'jassub/dist/wasm/jassub-worker-modern.js'
import 'jassub/dist/worker/worker.js'

self.jassubLoadWasmGlue = (url) => Promise.resolve({
  default: String(url).includes('modern') ? modernGlue : normalGlue,
})
