import $L from '../../../services/i18n.js'
import * as settings from '../../../state/settings.js'
import { seerrState } from '../../../state/seerr.js'
import { getImageUrl as seerrImage } from '../../../services/seerrApi.js'
import { navOnLeft, theme } from '../../theme.js'
import { KICKER_LS, LH, LS, argb, dp, fitLine, fitLines, flowPills, flowTags, lineCount, lineY, linesY, over, pillBox, setMeasure, textWidth } from './calendarLayout.js'
import { textReady, textWidth as themedWidth, themeSpacing } from '../../text.js'
import { formatClockTime } from '../../../utils/clock.js'
import { formatShortDayName } from '../../../utils/dateFormat.js'
import { uiLocale } from '../../../utils/uiLocale.js'
import { BADGE, PROBLEM, daysBetween, inLibrary, isEpisode, isMovie, playableId, statusAt } from '../../../utils/calendarEntries.js'
import { hex2 } from '../../themeColor.js'

// The calendar sets its own letter spacing, which replaces the theme's (Neon Pulse's 0.6px).
setMeasure((str, size, weight) => themedWidth(str, size, weight) - themeSpacing() * str.length, textReady)

// The calendar views' colors, labels and actions, and the models the views draw from.

export { KICKER_LS, LH, LS, argb, dp, fitLine, fitLines, flowPills, flowTags, lineY, linesY, pillBox, textWidth }

const MOVIE_COLOR = '#FFF2A93B'
export const READY_COLOR = '#FF5BC46A'
const MISSING_COLOR = '#FFE0A15A'
const MUTED_COLOR = '#99FFFFFF'
const CHIP_COLOR = '#BFFFFFFF'

/** The theme accent, page color and per entry colors, which all follow the Look settings. */
export const calendarLook = (s = settings.all()) => {
  const t = theme()
  const accentHex = '#' + t.accent.slice(7, 9) + t.accent.slice(1, 7)
  const byStatus = s.calendarColorBy === 'status'
  const badges = s.calendarShowBadges !== false
  // The app layer and the page both paint the theme background over black.
  const page = over(t.background, over(t.background, '#000000'))
  const bgA = parseInt(t.background.slice(7, 9), 16) / 255
  const colorHex = (e, now) => {
    if (byStatus) {
      const status = statusAt(e, now)
      if (status === 'ready') return READY_COLOR
      if (status === 'missing') return MISSING_COLOR
      return accentHex
    }
    return isMovie(e) ? MOVIE_COLOR : accentHex
  }
  const badgeOf = (e) => (badges ? badgeLabel(e.badge) : null)
  return {
    page,
    bg: (alpha) => t.background.slice(0, 7) + hex2(Math.min(1, bgA * alpha) * 255),
    accent: t.accent,
    accentA: t.accentA,
    accentHex,
    focus: t.focus,
    focusFill: t.onSurface,
    focusInk: t.navFocusInk.slice(0, 7) === '#000000' ? '#000000de' : '#ffffff',
    badges,
    color: (e, now) => argb(colorHex(e, now)),
    badgeOf,
    tags: (e, now) => {
      const out = []
      const badge = badgeOf(e)
      if (badge) out.push({ label: badge, color: accentHex })
      if (inLibrary(e)) out.push({ label: $L('In library'), color: READY_COLOR })
      else if (statusAt(e, now) === 'missing') out.push({ label: $L('Missing'), color: MISSING_COLOR })
      if (!e.monitored) out.push({ label: $L('Not monitored'), color: MUTED_COLOR })
      return out
    },
    chips: (e) =>
      [
        e.network ? { label: e.network, color: CHIP_COLOR } : null,
        e.runtimeMinutes > 0 ? { label: $L('{minutes} min').replace('{minutes}', String(e.runtimeMinutes)), color: CHIP_COLOR } : null,
      ].filter(Boolean),
  }
}

const badgeLabel = (badge) => {
  switch (badge) {
    case BADGE.seriesPremiere:
      return $L('Series premiere')
    case BADGE.seasonPremiere:
      return $L('New season')
    case BADGE.midseasonFinale:
      return $L('Midseason finale')
    case BADGE.seasonFinale:
      return $L('Finale')
    case BADGE.seriesFinale:
      return $L('Series finale')
    default:
      return null
  }
}

const releaseLabel = (release) => {
  if (release === 'cinema') return $L('Cinema')
  if (release === 'digital') return $L('Digital')
  if (release === 'physical') return $L('Physical')
  return ''
}

export const artIcon = (e) => (isMovie(e) ? 'movie_outlined' : 'tv_rounded')

const calendarTime = (e, clockDisplay) => (e.hasTime ? formatClockTime(e.date, clockDisplay) : $L('All day'))

export const calendarDayName = (day, today, dateFormat) => {
  const diff = daysBetween(today, day)
  if (diff === 0) return $L('Today')
  if (diff === 1) return $L('Tomorrow')
  if (diff === -1) return $L('Yesterday')
  return formatShortDayName(day, dateFormat)
}

/** When it airs, like "Today at 9:00 PM", or the day alone for a movie. */
export const calendarWhen = (e, today, clockDisplay, dateFormat) => {
  const day = calendarDayName(e.day, today, dateFormat)
  if (!e.hasTime) return day
  return $L('{day} at {time}').replace('{day}', day).replace('{time}', calendarTime(e, clockDisplay))
}

/** The episode code and name, or the movie's release type and year. */
export const calendarSubtitle = (e, hideSpoilers) => {
  if (isMovie(e)) return [releaseLabel(e.release), e.year != null ? String(e.year) : null].filter(Boolean).join(' · ')
  const code = e.seasonNumber != null && e.episodeNumber != null ? `S${e.seasonNumber} E${e.episodeNumber}` : null
  return [code, !hideSpoilers ? e.episodeTitle : null].filter(Boolean).join(' · ')
}

/** The episode still when spoilers allow it, otherwise the series or movie backdrop. */
export const thumbOf = (e, hideSpoilers) => (!hideSpoilers && e.stillUrl) || e.backdropUrl || e.posterUrl

// TMDB sizes the artwork by its path, and a thumbnail this small doesn't need the big file. The
// hero and preview art is at most 1133 px wide, so it asks for TMDB's 1280 rather than the original,
// which can be 4K and weighs on the TVs' texture memory.
// Radarr's IMDb art comes from Amazon at full size, which takes the same kind of size suffix.
const sized = (url, size) =>
  url ? url.replace(/\/t\/p\/(original|w\d+)\//, `/t/p/${size}/`).replace(/\._V1_\.(jpg|png)$/, `._V1_UX${size.slice(1)}_.$1`) : null
export const artUrl = (url, thumb) => (url ? seerrImage(sized(url, thumb ? 'w300' : 'w1280')) || '' : '')

const problemText = (problem) => {
  switch (problem) {
    case PROBLEM.adminsOnly:
      return $L('The calendar is limited to admins on this server.')
    case PROBLEM.needsAdminSeerr:
      return $L('An admin needs to sign in to {seerr} in Moonfin before the calendar can load.').replace(
        '{seerr}',
        seerrState().displayName || 'Seerr'
      )
    case PROBLEM.notConfigured:
      return $L('No Sonarr or Radarr server is linked yet.')
    default:
      return $L("Couldn't load the calendar.")
  }
}

const seerrOn = () => seerrState().enabled === true

/**
 * What OK and the buttons do. The episode or movie page when it's on the server, the series page for
 * an episode that isn't yet, and the Seerr page for a title the server lacks.
 */
export const calendarActions = (router, s = settings.all()) => {
  const playOnSelect = s.calendarSelectAction === 'play'
  const requestButton = s.calendarRequestButton !== false
  const openSeerr = (e) => {
    if (!seerrOn() || e.tmdbId == null) return
    router.to(`/seerr/item/${isMovie(e) ? 'movie' : 'tv'}/${e.tmdbId}`)
  }
  const play = (e) => {
    const id = playableId(e)
    if (id) router.to(`/player/${id}`)
  }
  const openDetails = (e) => {
    if (e.episodeId) router.to(`/details/${e.episodeId}`)
    else if (e.itemId) router.to(`/details/${e.itemId}`)
    else openSeerr(e)
  }
  const openSeries = (e) => {
    if (e.itemId) router.to(`/details/${e.itemId}`)
    else openSeerr(e)
  }
  return {
    play,
    request: openSeerr,
    select: (e) => (playOnSelect && inLibrary(e) ? play(e) : openDetails(e)),
    openTitle: (e) => (isEpisode(e) ? openSeries(e) : openDetails(e)),
    canOpen: (e) => Boolean(e.itemId || e.episodeId || (seerrOn() && e.tmdbId != null)),
    showsRequest: (e) => !e.monitored && !inLibrary(e) && e.tmdbId != null && seerrOn() && requestButton,
  }
}

/** The Go to Series or Movie details button. */
export const titleButton = (e) => ({
  id: 'open',
  label: isEpisode(e) ? $L('Go to Series') : $L('Movie details'),
  icon: isEpisode(e) ? 'tv_rounded' : 'info_outline_rounded',
})

/** The week's first day for the Week starts on setting, 0 for Sunday. */
export const weekStartOf = (setting) => {
  if (setting === 'sunday') return 0
  if (setting === 'monday') return 1
  // shortcut: without Intl.Locale week data (Chrome 38) this falls back to Sunday. Add a first day
  // of the week table by region if a Monday region needs it there.
  try {
    const locale = new Intl.Locale(new Intl.DateTimeFormat(uiLocale()).resolvedOptions().locale)
    const info = locale.weekInfo || (locale.getWeekInfo && locale.getWeekInfo())
    if (info && info.firstDay) return info.firstDay % 7
  } catch (e) {
    void e
  }
  return 0
}

/** A CalPill's model for a button {id, label, icon, primary, disabled} laid out by flowPills or pillBox. */
export const pillModel = (b, look, uiFont) => ({
  ...b,
  k: b.id,
  label: b.label || '',
  src: b.icon ? `icons/${b.icon}.webp` : '',
  font: uiFont('bold'),
  ls: LS,
  bg: b.primary ? look.accent : '#ffffff1f',
  fg: '#ffffff',
  dim: !!b.disabled,
})

/** A tab chip's model, with its accent fill when selected. */
export const tabModel = (id, label, selected, look, uiFont) => {
  const size = dp(14)
  const line = size * LH
  const border = 1
  const padX = dp(16)
  const h = 2 * (border + dp(8)) + line
  return {
    id,
    k: id,
    label,
    w: 2 * (border + padX) + textWidth(label, size, 'bold'),
    h,
    size,
    border,
    radius: dp(18),
    iconSize: 0,
    iconX: 0,
    iconY: 0,
    src: '',
    textX: border + padX,
    textY: lineY(border + dp(8), line, size),
    font: uiFont('bold'),
    ls: LS,
    bg: selected ? look.accent : '#ffffff1a',
    fg: selected ? '#ffffff' : '#ffffffd9',
    dim: false,
  }
}

/**
 * CalMessage's model for an area {x, y, w, h}: the spinner while loading, else the problem or empty
 * text with its icon, and Retry for a problem other than admins only.
 */
export const messageModel = (box, { loading, problem, emptyText }, look, uiFont) => {
  const size = dp(16)
  const lh = size * LH
  const text = loading ? '' : problem ? problemText(problem) : emptyText
  const textW = Math.min(dp(500), box.w - dp(32) * 2)
  const lines = Math.max(1, lineCount(text, size, 'regular', textW))
  const wrapped = fitLines(text, size, 'regular', textW, 99)
  const retry = !loading && problem && problem !== PROBLEM.adminsOnly
  const pill = retry ? pillBox({ label: $L('Retry'), icon: 'refresh_rounded' }) : null
  const total = 80 + dp(16) + lines * lh + dp(20) + (pill ? pill.h : 0)
  const top = (box.h - total) / 2
  return {
    k: loading ? 'loading' : problem ? 'problem' : 'empty',
    ...box,
    loading: !!loading,
    icon: problem ? 'icons/event_busy_rounded.webp' : 'icons/event_available_rounded.webp',
    iconY: top,
    text: wrapped,
    font: uiFont(),
    textW,
    lh,
    ls: LS,
    textY: linesY(top + 80 + dp(16), size),
    retry: pill
      ? [{ ...pillModel({ id: 'retry', label: $L('Retry'), icon: 'refresh_rounded' }, look, uiFont), ...pill, x: (box.w - pill.w) / 2, y: top + 80 + dp(16) + lines * lh + dp(20) }]
      : [],
  }
}

/**
 * One agenda row: time, colored bar, thumbnail, title, subtitle and tags, with its
 * parts placed for a row `w` wide. compact is the month grid's narrower side panel.
 */
export const agendaRowModel = (e, { w, compact, look, now, spoilers, s, fontFor, uiFont }) => {
  const pad = dp(6)
  const timeW = dp(compact ? 56 : 72)
  const artH = dp(compact ? 49.5 : 72)
  const artW = dp(compact ? 88 : 128)
  const barX = pad + timeW
  const thumbX = barX + dp(3) + dp(10)
  const textX = thumbX + artW + dp(12)
  const textW = w - textX - pad
  const subtitle = calendarSubtitle(e, spoilers)
  const flow = flowTags(look.tags(e, now), textW)
  const titleLh = dp(15) * LH
  const subLh = dp(13) * LH
  const blockH = titleLh + (subtitle ? subLh : 0) + (flow.tags.length ? dp(4) + flow.h : 0)
  // The row is a centered flex line, so a text block taller than the art (the month panel's with
  // tags) makes the row taller and the art, bar and time center in it.
  const inner = Math.max(artH, blockH)
  const h = pad * 2 + inner
  const artY = pad + (inner - artH) / 2
  const top = pad + (inner - blockH) / 2
  // The time column is narrow in the month panel, where "11:00 AM" wraps onto two lines.
  const timeLh = dp(13) * LH
  const time = fitLines(calendarTime(e, s.clockDisplay), dp(13), 'bold', timeW, 9)
  const timeLines = time.split('\n').length
  return {
    k: e.key,
    h,
    w,
    time,
    timeFont: uiFont('bold'),
    timeX: pad,
    timeY: linesY(pad + (inner - timeLines * timeLh) / 2, dp(13)),
    timeLh,
    barX,
    barY: artY,
    barH: artH,
    bar: look.color(e, now),
    thumbX,
    artW,
    artH,
    src: artUrl(thumbOf(e, spoilers), true),
    icon: `icons/${artIcon(e)}.webp`,
    textX,
    textW,
    title: fitLine(e.title, dp(15), 'bold', textW),
    titleFont: fontFor(e.title, 'bold'),
    titleY: lineY(top, titleLh, dp(15)),
    subtitle: fitLine(subtitle, dp(13), 'regular', textW),
    subFont: fontFor(subtitle),
    subY: lineY(top + titleLh, subLh, dp(13)),
    tagFont: uiFont('bold'),
    tags: flow.tags.map((t) => ({ ...t, font: fontFor(t.label, 'bold'), y: t.y + top + titleLh + (subtitle ? subLh : 0) + dp(4) })),
  }
}

/** The page's padding, clearing the top bar or the left rail for any sidebar style. */
export const insets = (s = settings.all()) =>
  navOnLeft(s)
    ? { top: dp(28), left: dp(104), right: dp(48), bottom: dp(24) }
    : { top: dp(95), left: dp(48), right: dp(48), bottom: dp(24) }
