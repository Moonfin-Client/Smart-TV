// The subtitle engine's files: the package's own by default, and after an in-app update replaced
// them, a worker that starts from a short script naming each stored file.
//   node --conditions=browser src/utils/assRenderer.check.mjs
import assert from 'node:assert/strict'

const made = new Map()
globalThis.document = { baseURI: 'file:///media/apps/moonfin/index.html#/home' }
globalThis.URL.createObjectURL = (blob) => {
  const url = `blob:${made.size + 1}`
  made.set(url, blob)
  return url
}

globalThis.window = {}
const plain = (await import('./assRenderer.js?package')).engine()
assert.deepEqual(plain, { workerUrl: 'subtitles-octopus-worker.js', legacyWorkerUrl: 'subtitles-octopus-worker-legacy.js', fallbackFont: 'ass-fallback-font.ttf' })
assert.equal(made.size, 0, 'nothing is made without an update')

globalThis.window = { __moonfinOta: { files: { 'subtitles-octopus-worker.js': 'blob:worker', 'subtitles-octopus-worker.wasm': 'blob:wasm' } } }
const updated = (await import('./assRenderer.js?updated')).engine()
assert.equal(updated.fallbackFont, 'file:///media/apps/moonfin/ass-fallback-font.ttf', 'the font as a full URL, since a blob worker has no folder')
const boot = await made.get(updated.workerUrl).text()
assert.match(boot, /locateFile:function\(p\)\{return p==="subtitles-octopus-worker\.wasm"\?"blob:wasm":p\}/)
assert.match(boot, /importScripts\("blob:worker"\)$/)
const legacy = await made.get(updated.legacyWorkerUrl).text()
assert.match(legacy, /importScripts\("file:\/\/\/media\/apps\/moonfin\/subtitles-octopus-worker-legacy\.js"\)$/, 'a file the update kept comes from the package')

const { scaleAssFontSizes } = await import('./assRenderer.js?scaling')
const script = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, Outline
Style: Default,Roboto,20,&H00FFFFFF,1
Style: Sign,Roboto,33.5,&H00FFFFFF,1
[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0,1,Default,{\\fs18\\pos(20,20)}sized {\\fs}reset
`
const scaled = scaleAssFontSizes(script, 1.5)
assert.match(scaled, /Style: Default,Roboto,30,&H00FFFFFF,1/)
assert.match(scaled, /Style: Sign,Roboto,50.25,&H00FFFFFF,1/)
assert.match(scaled, /\{\\fs27\\pos\(20,20\)\}sized \{\\fs\}reset/, 'only a number follows fs')
assert.equal(scaleAssFontSizes(script, 1), script)
console.log('subtitle engine files ok')
