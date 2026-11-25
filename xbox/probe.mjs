// The device probe, the page Settings opens on Xbox for a signed in user (src/utils/deviceProbe.js).
// It reports what the WebView can do. Server and media addresses are written into the package
// rather than the repo. Test clips in probe/media, made with probe/make-clips.cjs, travel with it,
// so the playback run needs no server at all.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROBE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'probe')

// What kind of file a test clip is, which tells the probe what has to come out of it.
const AUDIO_ONLY = /\.(mp3|flac|m4a|aac|ogg|opus|wav)$/i
const MEDIA_FILE = /\.(mp4|m4v|mkv|webm|mov|ts|mp3|flac|m4a|aac|ogg|opus|wav)$/i

// The page goes into `dir`. `assets` is where, seen from there, the subtitle workers sit. `clips`
// takes the test clips along, `chosen` only the ones named, and `tester` leaves the Dolby Vision
// samples out. `server`, `emby`, `image` and `report` are addresses, and `media` more clips by
// address, as label=url.
export const writeProbe = (dir, { assets = '', clips = true, chosen = [], tester = false, server = '', emby = '', image = '', report = '', media = [], from = PROBE_DIR } = {}) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isFile() && entry.name !== 'make-clips.cjs') cpSync(join(from, entry.name), join(dir, entry.name))
  }

  const mediaSource = join(from, 'media')
  const missing = chosen.filter((name) => !existsSync(join(mediaSource, name)))
  if (missing.length) throw new Error(`--clips names clips that are not in probe/media: ${missing.join(', ')}. Make them with node xbox/probe/make-clips.cjs`)
  // Dolby Vision clips are sample media put there by hand for local tests, so they never go to testers.
  const names =
    clips && existsSync(mediaSource)
      ? readdirSync(mediaSource).filter((name) => (!chosen.length || chosen.includes(name)) && !(tester && /^dv-/.test(name))).sort()
      : []
  const bundled = names.filter((name) => MEDIA_FILE.test(name))
  // An HLS stream is a folder of its playlist and segments.
  const streams = names.filter((name) => existsSync(join(mediaSource, name, 'index.m3u8')))
  for (const name of bundled.concat(streams)) cpSync(join(mediaSource, name), join(dir, 'media', name), { recursive: true })

  const config = {
    assets,
    jellyfin: server,
    emby,
    image,
    report,
    media: [
      // A clip named t- belongs to a test a person has to judge, and the unattended run leaves it out.
      ...bundled.map((name) => ({ label: name, url: `media/${name}`, video: !AUDIO_ONLY.test(name), interactive: /^t-/.test(name) })),
      ...streams.map((name) => ({ label: name, url: `media/${name}/index.m3u8`, video: true, interactive: /^t-/.test(name) })),
      ...media.map((entry) => {
        const split = entry.indexOf('=')
        return split === -1 ? { label: entry, url: entry } : { label: entry.slice(0, split), url: entry.slice(split + 1) }
      }),
    ],
  }
  writeFileSync(join(dir, 'probe-config.js'), `window.PROBE_CONFIG = ${JSON.stringify(config, null, '\t')};\n`)
  return { config, bundled: bundled.concat(streams) }
}
