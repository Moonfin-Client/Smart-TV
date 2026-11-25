// hls.js setup: its buffer caps, a start that waits for buffered fragments, and recovery from stalls
// and fatal errors. It's plain JS so the check can run it against a stub of hls.js.

// The Fire TV WebView keeps what it has played, so a high bitrate stream holds 10 s each way there
// or the stick runs out of memory. A Silo copy holds what its byte budget allows (copyBuffer.js).
export const hlsConfig = ({ vega, copyBuffer, startPosition }) => ({
  enableWorker: false,
  lowLatencyMode: false,
  maxBufferLength: vega ? 10 : copyBuffer ? copyBuffer.ahead : 30,
  maxMaxBufferLength: copyBuffer ? copyBuffer.ahead : 60,
  backBufferLength: vega ? 10 : copyBuffer ? copyBuffer.behind : Infinity,
  ...(startPosition > 0 ? { startPosition } : null),
  startFragPrefetch: true,
  maxBufferHole: 0.5,
  nudgeMaxRetry: 5,
})

// A fatal error hls.js can't climb out of after this many recoveries in a row goes to the player,
// whose fallbacks try another stream. Each buffered fragment starts the count over.
const MAX_RECOVERIES = 3

// Playback starts once two fragments are in (one for live TV), so the picture opens moving.
// fail(details) hears what hls.js can't fix. hold() says a group is holding the start, which play() lets go of.
export const createHls = (Hls, video, { url, isLive, vega, copyBuffer, startPosition, hold }, fail) => {
  const hls = new Hls(hlsConfig({ vega, copyBuffer, startPosition }))
  const need = isLive ? 1 : 2
  let buffered = 0
  let started = false
  let stalls = 0
  let recoveries = 0

  hls.on(Hls.Events.FRAG_BUFFERED, () => {
    buffered++
    recoveries = 0
    if (started || buffered < need) return
    started = true
    if (hold && hold()) return
    const p = video.play()
    if (p && p.catch) p.catch(() => {})
  })

  hls.on(Hls.Events.ERROR, (_event, data) => {
    const details = (data && data.details) || ''
    // A start that sits at its first frame gets a nudge, then a media recovery.
    if (started && !data.fatal && (details === 'bufferStalledError' || details === 'bufferNudgeOnStall')) {
      stalls++
      if (stalls === 3 && video.currentTime < 1) video.currentTime = 0.5
      else if (stalls === 6 && video.currentTime < 2) hls.recoverMediaError()
    }
    if (!data.fatal) return
    // Retrying a live channel forever would never give its tuner back, so it goes to the live
    // recovery, which has a budget.
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !isLive && recoveries < MAX_RECOVERIES) {
      recoveries++
      hls.startLoad()
    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries < MAX_RECOVERIES) {
      recoveries++
      hls.recoverMediaError()
    } else fail(details || 'hls')
  })

  video.autoplay = false
  hls.attachMedia(video)
  hls.loadSource(url)
  // hls.js has a started flag of its own, about loading, so this one is handed back beside it.
  return { hls, started: () => started }
}
