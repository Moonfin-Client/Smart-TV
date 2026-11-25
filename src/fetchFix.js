// Imported before the renderer. On webOS 3 a packaged file fetched over file:// answers with status 0,
// which both the native fetch and the whatwg-fetch Response reject, so packaged files (font
// atlases) go through XHR there, the way the renderer's own fetchJson does. Network URLs keep
// the real fetch.
// Text files are read as text, so the browser decodes them natively. Decoding the bytes in JS cost
// webOS seconds of boot over the font atlases' data. Anything else is read as bytes, and a body
// asked for in the other form reads the file again.
const original = window.fetch
const TEXT = /\.(json|txt|html?|css|js|xml|vtt|srt|ass|ssa)([?#]|$)/i

const read = (url, type) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = type
    xhr.onload = () => resolve(xhr)
    xhr.onerror = () => reject(new TypeError(`Network request failed for ${url}`))
    xhr.send(null)
  })

const xhrFetch = (url) => {
  const first = TEXT.test(url) ? '' : 'arraybuffer'
  return read(url, first).then((xhr) => {
    const status = xhr.status || 200
    const as = (type) => (type === first ? Promise.resolve(xhr) : read(url, type))
    const text = () => as('').then((x) => x.responseText)
    const bytes = () => as('arraybuffer').then((x) => x.response)
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: xhr.statusText,
      url,
      arrayBuffer: bytes,
      text,
      json: () => text().then(JSON.parse),
      blob: () => bytes().then((buffer) => new Blob([buffer])),
    }
  })
}

if (typeof createImageBitmap !== 'function') {
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url
    if (url && !/^https?:/i.test(url)) return xhrFetch(url)
    return original ? original(input, init) : xhrFetch(url)
  }
}
