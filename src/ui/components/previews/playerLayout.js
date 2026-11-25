// The player scene's rules, kept pure so playerLayout.check.mjs can test them. The controls
// themselves are the player's own PlayerOsd.

// The sample episode: 44 minutes, four chapters.
export const SAMPLE_DURATION = 2640
export const SAMPLE_CHAPTERS = [0, 0.18, 0.47, 0.81].map((share) => ({ startPositionTicks: Math.round(share * SAMPLE_DURATION) * 10000000 }))
export const SAMPLE_SEGMENTS = { intro: { remainingSeconds: 45, progress: 0.75 }, outro: { remainingSeconds: 80, progress: 80 / 90 } }
export const SUBTITLE_LINES = {
  jpn: '待って、今の聞こえた？',
  spa: 'Espera, ¿oíste eso?',
  fre: 'Attends, tu as entendu ça ?',
  fra: 'Attends, tu as entendu ça ?',
  ger: 'Warte, hast du das gehört?',
  deu: 'Warte, hast du das gehört?',
}

// What a [moment] shows with settings [s]: which prompt, which card, whether the controls are up,
// where the bar is, what holds focus and how the picture is fitted.
export const playerMoment = (moment, s) => {
  const paused = moment === 'paused'
  const scrubPaused = moment === 'seek' && s.trickPlayPauseWhileScrubbing !== false && s.trickPlayMode !== 'disabled'
  const describing = paused && !!s.showDescriptionOnPause
  const subtitles = !describing && s.subtitleMode !== 'none'
  const intro = s.introAction || 'ask'
  const outro = s.outroAction || 'ask'
  const nextUp = s.nextUpBehavior || 'extended'
  const timeout = s.nextUpTimeout != null ? s.nextUpTimeout : 7
  const outroCard = s.replaceSkipOutroWithNextUp === true && nextUp !== 'disabled'
  let skip = null
  if (moment === 'countdown' || (moment === 'intro' && intro === 'ask')) skip = 'intro'
  else if (moment === 'outro' && outro === 'ask' && !outroCard) skip = 'outro'
  let card = null
  if (moment === 'end' && nextUp !== 'disabled' && !(s.autoPlay && timeout <= 0)) card = { countdown: s.autoPlay ? timeout : null }
  else if (moment === 'outro' && outroCard && outro === 'ask') card = { countdown: null }
  else if (moment === 'airDate' && nextUp !== 'disabled' && s.showNextAirDate !== false) card = { airDate: true }
  const controls = !describing && moment !== 'watching' && moment !== 'airDate' && !card
  let progress = 0.42
  if (moment === 'intro' || moment === 'countdown') progress = moment === 'intro' && intro === 'auto' ? 0.15 : 0.07
  else if (moment === 'outro') progress = 0.97
  else if (moment === 'end' || moment === 'airDate') progress = 0.99
  else if (moment === 'seek') progress = 0.3
  let focus = null
  if (moment === 'seek') focus = 'progress'
  else if (moment === 'middle' || moment === 'paused') focus = 'button'
  const fit = moment === 'watching' ? 'autoCrop' : s.playerZoomMode || 'fit'
  return { paused: paused || scrubPaused, describing, subtitles, skip, card, controls, progress, focus, fit, timeout }
}

// The picture's box on the design screen: a 2.39:1 film for Fit, cropped to fill, or stretched.
export const pictureBox = (fit) => {
  if (fit === 'autoCrop') return { x: -165, y: 0, w: 1290, h: 540, scaleY: 1 }
  if (fit === 'stretch') return { x: 0, y: 0, w: 960, h: 402, scaleY: 1.3433 }
  return { x: 0, y: 69, w: 960, h: 402, scaleY: 1 }
}

// How far up the screen, in percent, the bar and the time row over it reach, plus the 12 the
// subtitle keeps clear, for the player's own bottomLayout [b] (components/player/osdLayout.js).
// The thumb rises past the bar's top.
export const controlsFloor = (b) => {
  const top = Math.min(b.top + 24, b.barY + 3 - 10.5)
  return ((1080 - top) / 1080 + 12 / 1080) * 100
}
