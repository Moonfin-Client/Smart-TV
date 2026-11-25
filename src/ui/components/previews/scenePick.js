// Which preview the stage draws, and with what, for the settings live preview and the setup wizard.
import { MEDIA_BAR_KEYS, SEASONAL_KEYS, SUBTITLE_HDR_KEYS, sceneOfRow } from '../../../pages/Settings/previewRows.js'
import { homeBackdropSettings } from '../../../utils/homeBackdropStyle.js'

const PLAYER_MOMENTS = {
  introAction: 'intro', nextUpCountdownStyle: 'countdown', outroAction: 'outro', replaceSkipOutroWithNextUp: 'outro', nextUpBehavior: 'end',
  nextUpTimeout: 'end', showNextAirDate: 'airDate', dateFormat: 'airDate', showDescriptionOnPause: 'paused',
}
// The subtitle look is judged with the controls away, the way most of a film is watched.
const STAGE_MOMENTS = { loading: 'loading', trickplay: 'seek', subtitles: 'watching' }
const RAIL_OPEN_KEYS = ['navbarColor', 'navbarOpacity', 'showClock', 'clockDisplay']

// The settings each scene drawn by a real screen tries before they're saved. The rest wait, since
// trying one of them can make the screen load again.
const TRIED_KEYS = { calendar: ['calendarStyle', 'calendarScope', 'calendarWeekStart'], library: ['libraryStyle', 'musicLibraryStyle', 'bookLibraryStyle'] }

// The overrides a picker's focused choice puts over the saved settings. [trying] is {key, value}.
export const triedOverrides = (scene, trying) => {
  const keys = TRIED_KEYS[scene]
  if (!trying || (keys && keys.indexOf(trying.key) < 0)) return null
  // Home's backdrop picker saves its switch along with the style, so both are tried together.
  return trying.key === 'homeBackdropStyle' ? homeBackdropSettings(trying.value) : { [trying.key]: trying.value }
}

// [s] holds the settings with the tried value over them.
export const settingsPick = (scene, row, s) => {
  const focusKey = row ? row.key : null
  const stage = row && row.stage && sceneOfRow(row) === scene ? row.stage : null
  if (scene === 'details') return { kind: 'details', variant: s.detailScreenStyle || 'v9' }
  if (scene === 'search') return { kind: 'search' }
  if (scene === 'calendar') return { kind: 'calendar', month: focusKey === 'calendarWeekStart' }
  if (scene === 'library') return { kind: 'library', focusKey }
  if (scene === 'player') return { kind: 'player', moment: STAGE_MOMENTS[stage] || PLAYER_MOMENTS[focusKey] || 'middle', hdr: SUBTITLE_HDR_KEYS.indexOf(focusKey) >= 0 }
  if (MEDIA_BAR_KEYS.indexOf(focusKey) >= 0) return { kind: 'mediaBar', mode: s.featuredBarStyle || 'moonfin', homeRows: true }
  const seasonal = SEASONAL_KEYS.indexOf(focusKey) >= 0
  return {
    kind: 'home',
    railOpen: RAIL_OPEN_KEYS.indexOf(focusKey) >= 0,
    seasonal,
    homeRows: true,
    focusCard: focusKey === 'focusBorderColor' || seasonal,
    atUiScale: focusKey === 'uiScale' || focusKey === 'homeRowsPosterSize',
    screensaver: stage === 'screensaver',
  }
}

export const wizardPick = (step, value, mediaBarMode) => {
  if (step === 'navbar') return { kind: 'navbar', position: value }
  if (step === 'mediaBar') return { kind: 'mediaBar', mode: value }
  if (step === 'homeRows') return { kind: 'rows', modern: value !== 'v1', carousel: value === 'carousel', focusFirst: value !== 'v1', ground: true }
  if (step === 'detailStyle') return { kind: 'details', variant: value }
  return { kind: 'mediaBar', mode: mediaBarMode }
}
