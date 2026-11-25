// One index.html that boots either build: the modern classic-script bundle on an engine that
// parses the newest syntax it may hold, the legacy SystemJS ES5 bundle everywhere else. A TV app
// runs from file://, where Chrome won't load a module script, so module/nomodule can't pick, and
// the chosen bundle's tags are written in by a classic script instead.

// The modern bundle targets chrome98, and the newest syntax that leaves in it is a class static
// block (Chrome 94, Tizen 7 and webOS 23). An engine without it stops at a SyntaxError here, ahead
// of the error log below, so the flag stays unset.
export const MODERN_PROBE = '<script>(class{static{window.__moonfinModern=1}})</script>'

// The earlier Moonfin TV app's in-app updates kept a downloaded release in IndexedDB, up to 16.5 MB
// of webOS's 21 MB. This package never boots it, so the stored copy and its keys go. The update
// loader in scripts/ota keeps its releases under other names.
const DROP_OTA = `<script>try{if(localStorage.getItem('moonfin_ota_installed')!==null){indexedDB.deleteDatabase('moonfin_ota');['moonfin_ota_ready','moonfin_ota_pending','moonfin_ota_bad','moonfin_ota_installed'].forEach(function(k){localStorage.removeItem(k)})}}catch(e){}</script>`

// Every script tag in the legacy page's body: polyfills, the SystemJS entry and the Chrome 38
// Symbol fix, in the order they have to run.
const legacyTags = (html) => {
  const body = html.slice(html.indexOf('<div id="app"></div>'))
  const tags = body.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || []
  if (!tags.some((t) => /vite-legacy-entry/.test(t))) throw new Error('legacy index.html has no SystemJS entry')
  return tags.map((t) => t.replace(/ (crossorigin|nomodule)(="[^"]*")?/g, '')).join('')
}

const modernTag = (html) => {
  const found = html.match(/<script defer src="([^"]+)"><\/script>/g) || []
  if (found.length !== 1) throw new Error(`modern index.html should have one deferred bundle, found ${found.length}`)
  return found[0].replace('<script defer src=', '<script src=')
}

// document.write keeps the tags parser-inserted, so they run in order like the markup they replace.
// The strings sit inside an inline script, which a literal close tag would end early.
const bootScript = (modern, legacy) => {
  const str = (s) => JSON.stringify(s).replace(/<\//g, '<\\/')
  return `<script>(function(){var m=window.__moonfinModern===1;window.__moonfinBundle=m?'modern':'legacy';document.write(m?${str(modern)}:${str(legacy)})})()</script>`
}

// Both bundles' script tags, as the boot script writes them.
export const bootTags = (legacyHtml, modernHtml) => ({ legacy: legacyTags(legacyHtml), modern: modernTag(modernHtml) })

// boot stands in for the boot script, in a package whose update loader picks the bundle instead.
export const combine = (legacyHtml, modernHtml, { headFirst = '', boot = '' } = {}) => {
  const { legacy, modern } = bootTags(legacyHtml, modernHtml)
  const start = legacyHtml.indexOf('<div id="app"></div>')
  const end = legacyHtml.lastIndexOf('</body>')
  if (start < 0 || end < 0 || legacyHtml.indexOf('<head>') < 0) throw new Error('legacy index.html is missing its head, app div or body end')
  const head = legacyHtml.slice(0, start).replace('<head>', `<head>\n    ${headFirst}${MODERN_PROBE}\n    ${DROP_OTA}`)
  return `${head}<div id="app"></div>\n    ${boot || bootScript(modern, legacy)}\n  ${legacyHtml.slice(end)}`.replace(/\n(\s*\n)+/g, '\n')
}
