// Self-check for probe.mjs: node xbox/probe.check.mjs
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROBE_DIR, writeProbe } from './probe.mjs'

const config = (dir) => JSON.parse(readFileSync(join(dir, 'probe-config.js'), 'utf8').replace(/^window\.PROBE_CONFIG = /, '').replace(/;\s*$/, ''))
const root = mkdtempSync(join(tmpdir(), 'probe-check-'))
try {
  // The real page, as the app build writes it: every file but the clip maker, no clips.
  const app = join(root, 'www', 'probe')
  const out = writeProbe(app, { assets: '../', clips: false })
  const files = readdirSync(app).sort()
  assert.deepEqual(files, readdirSync(PROBE_DIR).filter((n) => n !== 'make-clips.cjs' && n !== 'media').concat('probe-config.js').sort())
  assert.ok(files.includes('index.html') && files.includes('probe.js'))
  assert.deepEqual(config(app), { assets: '../', jellyfin: '', emby: '', image: '', report: '', media: [] })
  assert.deepEqual(out.bundled, [])

  // Clips: files and HLS folders go along, Dolby Vision samples stay home for testers.
  const src = join(root, 'src')
  mkdirSync(join(src, 'media', 'hls-1080'), { recursive: true })
  writeFileSync(join(src, 'index.html'), '<html></html>')
  writeFileSync(join(src, 'make-clips.cjs'), '')
  writeFileSync(join(src, 'media', 'h264-1080.mp4'), 'v')
  writeFileSync(join(src, 'media', 't-surround.m4a'), 'a')
  writeFileSync(join(src, 'media', 'dv-p8.mp4'), 'dv')
  writeFileSync(join(src, 'media', 'hls-1080', 'index.m3u8'), '#EXTM3U')
  const dir = join(root, 'out')
  const all = writeProbe(dir, { from: src, tester: true, media: ['remote=http://x/a.mkv', 'http://x/b.mp4'] })
  assert.deepEqual(all.bundled, ['h264-1080.mp4', 't-surround.m4a', 'hls-1080'])
  assert.ok(existsSync(join(dir, 'media', 'hls-1080', 'index.m3u8')) && !existsSync(join(dir, 'media', 'dv-p8.mp4')))
  assert.ok(!existsSync(join(dir, 'make-clips.cjs')))
  assert.deepEqual(config(dir).media, [
    { label: 'h264-1080.mp4', url: 'media/h264-1080.mp4', video: true, interactive: false },
    { label: 't-surround.m4a', url: 'media/t-surround.m4a', video: false, interactive: true },
    { label: 'hls-1080', url: 'media/hls-1080/index.m3u8', video: true, interactive: false },
    { label: 'remote', url: 'http://x/a.mkv' },
    { label: 'http://x/b.mp4', url: 'http://x/b.mp4' },
  ])
  assert.throws(() => writeProbe(join(root, 'o2'), { from: src, chosen: ['nope.mp4'] }), /nope\.mp4/)
  assert.deepEqual(writeProbe(join(root, 'o3'), { from: src, chosen: ['dv-p8.mp4'] }).bundled, ['dv-p8.mp4'])
} finally {
  rmSync(root, { recursive: true, force: true })
}
console.log('probe ok')
