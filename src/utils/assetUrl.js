// A package file the running in-app update replaced, as the blob URL the update loader made for it
// (scripts/ota/loader.js). Anything else loads from the package as before. It takes a package path
// or a full URL into the package, which is how the bundles name the files they import. The renderer
// does the same lookup for every image (scripts/patch-renderer.mjs), so this is for everything else.
export const assetUrl = (path) => {
  const files = typeof window !== 'undefined' && window.__moonfinOta && window.__moonfinOta.files
  if (!files) return path
  const base = new URL('.', document.baseURI).href
  const name = path.indexOf(base) === 0 ? path.slice(base.length) : path.replace(/^\.\//, '')
  return files[name] || path
}
