// ASS tracks (libass-wasm) and PGS tracks (libpgs) drawn on the DOM canvas between the video and
// the app. Both run in canvas mode and follow the player's clock, so webOS and Tizen draw them the
// same way. One track at a time.
import {
  supportsAssRenderer,
  initAssCanvasRenderer,
  disposeAssRenderer,
  assTimelineEvents,
  setAssTime,
  setAssFontScale,
  clearAssCanvas,
} from '../../utils/assRenderer.js'
import { initPgsCanvasRenderer, disposePgsRenderer } from '../../utils/pgsRenderer.js'
import { waitForAssReady } from '../../utils/assRendererReady.js'
import { createInBandPgsSource } from '../../utils/mkvPgsSource.js'
import { createSupWindowRenderer } from './supWindow.js'
import * as playback from '../../services/playback.js'
import { subtitleCanvas, subtitleRect, on as onEngine } from '../../state/videoEngine.js'

let ass = null
let pgs = null
let gen = 0

export const canDrawAss = () => supportsAssRenderer()

export const stop = () => {
  gen++
  if (ass) disposeAssRenderer(ass)
  if (pgs) disposePgsRenderer(pgs)
  if (ass || pgs) clearAssCanvas(subtitleCanvas())
  ass = null
  pgs = null
}

// Resolves true once the track draws. A newer start or a stop in between throws this one away.
export const startAss = async (stream, fontScale, onError) => {
  stop()
  const mine = gen
  const url = playback.getAssSubtitleUrl(stream)
  if (!url) return false
  const r = await initAssCanvasRenderer(subtitleCanvas(), url, playback.getAssFontsUrl(stream), onError)
  if (mine !== gen) {
    disposeAssRenderer(r)
    return false
  }
  ass = r
  if (r) {
    setAssFontScale(r, fontScale)
    fitAss(subtitleRect())
  }
  return !!r
}

// The canvas covers the picture on the <video> path, so the renderer draws at its size.
const fitAss = (rect) => {
  if (ass && rect && ass.resize) ass.resize(Math.max(1, rect.w), Math.max(1, rect.h))
}
onEngine('geometry', fitAss)

// libpgs reads a subtitle by url, so the in-band bytes reach it through a fetch that answers one url nobody else
// asks for, for as long as its constructor fetches (pgsRenderer.js does the same for its video mode).
let inBandCount = 0
const answerFetch = (url, readable) => {
  const original = globalThis.fetch
  globalThis.fetch = (input, init) =>
    (typeof input === 'string' ? input : input && input.url) === url
      ? Promise.resolve(new Response(readable, { headers: { 'Content-Type': 'application/octet-stream' } }))
      : original(input, init)
  return () => (globalThis.fetch = original)
}

// An embedded PGS track read out of the file near the playhead, so the server never has to read the whole file
// to extract it. Drawn on the canvas at the player's clock.
let clock = 0
const startInBandPgs = async (canvas, stream, at) => {
  const source = createInBandPgsSource({
    streamUrl: stream.inBand.streamUrl,
    subtitleOrdinal: stream.inBand.ordinal,
    getTime: () => clock,
    startTime: at,
  })
  if (!source) return null
  try {
    if (!(await source.ready)) {
      source.dispose()
      return null
    }
    const { PgsRenderer } = await import('libpgs')
    const url = `moonfin-inband-pgs://${++inBandCount}`
    const restore = answerFetch(url, source.readable)
    let r
    try {
      r = new PgsRenderer({ canvas, subUrl: url, mode: 'mainThread' })
    } finally {
      restore()
    }
    return {
      renderAtTimestamp: (t) => r.renderAtTimestamp(t),
      // libpgs can't rewind past what it has parsed, so a seek back behind it needs a new renderer.
      needsRestart: (t) => source.needsRestart(t),
      dispose: () => {
        source.dispose()
        r.dispose()
      },
    }
  } catch (e) {
    source.dispose()
    return null
  }
}

let pgsStream = null

// at is the player's clock in seconds, where an in-band track starts reading.
export const startPgs = async (stream, at = 0) => {
  stop()
  const mine = gen
  clock = Math.max(0, at)
  let r = stream.inBand ? await startInBandPgs(subtitleCanvas(), stream, clock) : null
  // The server's extracted file stands in when the container can't be read here, a window at a time
  // where the server answers ranges.
  if (!r && mine === gen && stream.deliveryUrl) {
    const { PgsRenderer } = await import('libpgs')
    if (mine === gen) r = await createSupWindowRenderer({ url: stream.deliveryUrl, canvas: subtitleCanvas(), PgsRenderer, at: clock })
  }
  if (!r && mine === gen && stream.deliveryUrl) r = await initPgsCanvasRenderer(subtitleCanvas(), stream)
  if (mine !== gen) {
    disposePgsRenderer(r)
    return false
  }
  pgs = r
  pgsStream = r ? stream : null
  return !!r
}

export const tick = (seconds) => {
  clock = Math.max(0, seconds)
  if (ass) setAssTime(ass, seconds)
  else if (pgs) {
    if (pgs.needsRestart && pgs.needsRestart(clock)) {
      const stream = pgsStream
      startPgs(stream, clock)
      return
    }
    pgs.renderAtTimestamp(clock)
  }
}

// Playing lets the ASS worker run its own clock between ticks, so animated lines move smoothly.
export const setPaused = (paused, seconds) => {
  if (ass && ass.setIsPaused) ass.setIsPaused(paused, Math.max(0, seconds))
}

// The ASS track's lines, for the offset strip's timeline.
export const assEvents = () => (ass ? assTimelineEvents(ass) : null)

// Resolves once the ASS track has read its script and fonts, or after ms, or once keepWaiting() says no.
export const ready = (ms, keepWaiting) => (ass ? waitForAssReady(ass, ms, keepWaiting) : Promise.resolve(false))

export const setFontScale = (scale) => {
  if (ass) setAssFontScale(ass, scale)
}
