// What the player does when playback fails. The answer is a step for the player to run and the
// message to show if it comes to that. Messages are English keys for $L().
//
// Steps: 'reconnect' (a Silo stream that played reopens where it was), 'ignore', 'recover' (live
// recovery), 'skip' (a broken pre-roll goes on to the next item), 'reopen' (Tizen: a stream that
// ran opens again as it was), 'transcode' (tier 1), 'h264' (tiers 2 and 3, hls.js with H.264), 'fail'.

const TIZEN_FAILED = 'Playback failed. The file format may not be supported.'

const CODE_MESSAGES = {
  1: 'Playback was aborted.',
  2: 'A network error occurred. Check your connection.',
  3: 'The video format is not supported by this TV.',
  4: 'The video source is not supported.',
}

export const errorMessage = (code) => (code ? CODE_MESSAGES[code] || 'An unknown playback error occurred.' : 'Playback failed.')

export const errorStep = (c) => {
  const transcoding = c.playMethod === 'Transcode'
  if (c.tizen) {
    // A file the set can't play isn't the connection's fault.
    if (!c.paused && c.canReconnect && (c.reconnecting || (c.played && !/NOT_SUPPORTED/.test(c.type || '')))) return { step: 'reconnect' }
    if (c.liveEngaged) return { step: 'recover' }
    if (c.skipTo) return { step: 'skip' }
    // Sitting paused long enough kills the pipeline, and nothing about such a stream is unplayable.
    if (c.played && !c.reopened && !transcoding) return { step: 'reopen', message: TIZEN_FAILED }
    if (!c.triedTranscode && !transcoding) return { step: 'transcode', message: TIZEN_FAILED }
    return { step: 'fail', message: TIZEN_FAILED }
  }
  if (!c.paused && c.canReconnect && (c.reconnecting || c.code === 2 || (c.code === 4 && c.played))) return { step: 'reconnect' }
  const startFailure = c.startTimedOut && !c.paused
  // A channel that fails to open reads as paused too, so only the viewer's own pause holds a live
  // error back. A file the set refuses reads as paused as well, so a pause before the source
  // opened holds nothing back.
  const paused = c.paused || (!c.isLive && c.elementPaused)
  if (paused && !startFailure && c.readyState) return { step: 'ignore' }
  if (c.liveEngaged) return { step: 'recover' }
  if (c.skipTo) return { step: 'skip' }
  if (c.audioOnly) return { step: 'fail', message: 'Audio playback failed for this track on this device.' }
  const message = errorMessage(c.code)
  if (!c.triedTranscode && !transcoding) return { step: 'transcode', message: 'Transcoding failed. The server may not support this format.', plain: message }
  if (transcoding && (!c.forceHlsJs || c.hlsRetries < 1) && c.hlsSupported) {
    return {
      step: 'h264',
      tier2: !c.forceHlsJs,
      message: !c.forceHlsJs ? 'H.264 transcoding fallback failed.' : 'Transcoding failed after retry. Try restarting the app.',
      plain: message,
    }
  }
  return { step: 'fail', message }
}
