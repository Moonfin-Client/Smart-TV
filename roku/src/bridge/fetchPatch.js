// Two gaps in the device's fetch. text() decodes the body as Windows-1252, so UTF-8 text comes out
// garbled ("80’s" as "80â€™s"). And Headers has keys() and get() but no forEach or entries, which
// SolidTV's settings sync and Seerr code iterate with. Each response gets both fixed.
const CHUNK = 8192

export const utf8 = (bytes) => {
  const units = new Uint16Array(bytes.length)
  let n = 0
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++]
    let c = b
    if (b >= 0xf0) c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)
    else if (b >= 0xe0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)
    else if (b >= 0xc0) c = ((b & 31) << 6) | (bytes[i++] & 63)
    if (c > 0xffff) {
      c -= 0x10000
      units[n++] = 0xd800 + (c >> 10)
      units[n++] = 0xdc00 + (c & 1023)
    } else {
      units[n++] = c
    }
  }
  let out = ''
  for (let i = 0; i < n; i += CHUNK) out += String.fromCharCode.apply(null, units.subarray(i, Math.min(n, i + CHUNK)))
  return out
}

const iterable = (headers) => {
  if (!headers || typeof headers.forEach === 'function') return headers
  const pairs = () => headers.keys().map((k) => [k, headers.get(k)])
  const add = {
    forEach: (fn, thisArg) => pairs().forEach(([k, v]) => fn.call(thisArg, v, k, headers)),
    entries: () => pairs()[Symbol.iterator](),
  }
  try {
    Object.assign(headers, add)
    if (typeof headers.forEach === 'function') return headers
  } catch {}
  return Object.assign(Object.create(headers), add, { get: (k) => headers.get(k), has: (k) => headers.has(k), keys: () => headers.keys() })
}

const fixed = (res) => {
  const headers = iterable(res.headers)
  const text = () => res.arrayBuffer().then((buf) => utf8(new Uint8Array(buf)))
  const json = () => text().then((t) => JSON.parse(t))
  try {
    Object.assign(res, { text, json })
    if (headers !== res.headers) Object.defineProperty(res, 'headers', { value: headers })
    if (res.text === text) return res
  } catch {}
  return {
    status: res.status,
    statusText: res.statusText,
    ok: res.ok,
    url: res.url,
    redirected: res.redirected,
    type: res.type,
    headers,
    text,
    json,
    arrayBuffer: () => res.arrayBuffer(),
    blob: () => res.blob(),
  }
}

export const patchFetch = () => {
  const nativeFetch = globalThis.fetch
  if (typeof nativeFetch !== 'function' || nativeFetch.patched) return
  const patched = (...args) => nativeFetch(...args).then(fixed)
  patched.patched = true
  globalThis.fetch = patched
}
