// What plays alongside a YouTube trailer: SponsorBlock's skips and YouTube's captions.
import { parseSubtitleText } from '../../../utils/subtitleText.js'
import { createCueText } from '../../../pages/Player/cueText.js'

const TICKS = 10000000
const SKIP_CHECK_MS = 500
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lrm: '', rlm: '', '#39': "'" }

// Where a trailer with segments starts: past the ones that run from its opening, and never before
// 5 s. One without segments starts at the top.
export const getTrailerStartTime = (segments) => {
  let startTime = 0
  if (!segments || segments.length === 0) return startTime
  const sorted = segments.slice().sort((a, b) => a.start - b.start)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].start <= startTime + 1) startTime = Math.max(startTime, sorted[i].end)
  }
  return Math.max(startTime, 5)
}

// Where to jump to from a segment the playhead is in, or -1. The last half second of one is left
// to play, so a jump that lands just short of its end doesn't jump again.
export const sponsorSkipTarget = (segments, time) => {
  for (let i = 0; i < (segments || []).length; i++) {
    if (time >= segments[i].start && time < segments[i].end - 0.5) return segments[i].end
  }
  return -1
}

// Jumps past the segments while the video plays. Returns what stops it.
export const skipSegments = (video, segments) => {
  if (!segments || segments.length === 0) return () => {}
  const timer = setInterval(() => {
    if (video.paused) return
    const to = sponsorSkipTarget(segments, video.currentTime)
    if (to >= 0) video.currentTime = to
  }, SKIP_CHECK_MS)
  return () => clearInterval(timer)
}

// YouTube's WebVTT as cues, without their tags or positions and with entities read.
export const parseCaptions = (vtt) =>
  parseSubtitleText(vtt).map((cue) => ({ ...cue, Text: cue.Text.replace(/&(#39|[a-z]+);/gi, (m, e) => (e.toLowerCase() in ENTITIES ? ENTITIES[e.toLowerCase()] : m)) }))

// The caption track's cues, or none when it can't be had.
export const loadCaptions = (url) =>
  fetch(url)
    .then((res) => (res.ok ? res.text() : null))
    .then((vtt) => (vtt ? parseCaptions(vtt) : []))
    .catch(() => [])

// Hands onText the captions on screen as the video's time moves, every cue that shows on a line of
// its own. Returns what stops it, which clears what was shown.
export const followCaptions = (video, cues, onText) => {
  const read = createCueText()
  let shown = ''
  const update = () => {
    const text = read(cues, video.currentTime * TICKS)
    if (text === shown) return
    shown = text
    onText(text)
  }
  video.addEventListener('timeupdate', update)
  update()
  return () => {
    video.removeEventListener('timeupdate', update)
    if (shown) onText('')
  }
}
