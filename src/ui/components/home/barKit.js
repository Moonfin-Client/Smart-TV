// What the media bars share: the image addresses they ask for, the carousel timer and the new
// release labels loaded beside the slides.
import { getServerUrl, createApiForServer, api } from '../../../services/jellyfinApi.js'
import { getFeaturedBackdropUrl, getImageUrl, getLogoUrl } from '../../../utils/helpers.js'
import { carouselIntervalMs } from '../../../utils/carouselTiming.js'
import { loadNewReleases, newReleaseKindsOf } from '../../../utils/mediaBarNewRelease.js'
import { shell } from '../../../state/shell/shellState.js'
import * as settings from '../../../state/settings.js'
import { onScreen } from './onScreen.js'

export const serverOf = (item) => (item && item._serverUrl) || getServerUrl()

export const backdropOf = (item, opts) => (item ? getFeaturedBackdropUrl(serverOf(item), item, opts) || '' : '')

// featured.js gives a list title its LogoUrl, and a library item falls back to the server's logo.
export const logoOf = (item) => (item ? item.LogoUrl || getLogoUrl(serverOf(item), item, { maxWidth: 800, quality: 90 }) || '' : '')

// Tagged with the item's own tag for that type, so the TV keeps the picture cached.
export const imageOf = (item, type, opts) => (item ? getImageUrl(serverOf(item), item.Id, type, { tag: (item.ImageTags || {})[type], ...opts }) || '' : '')

// The frosted glass behind the info box and arrows is a small copy of the backdrop that the server
// blurs. A list title's TMDB art has no blur, so its smallest size stands in.
export const frostOf = (item) => {
  if (!item) return ''
  if (item._external) return (item._externalBackdropUrl || '').replace(/\/w\d+\//, '/w300/')
  const url = backdropOf(item, { maxWidth: 480, quality: 60 })
  return /\/Items\/[^/]+\/Images\/Backdrop/.test(url) ? url + '&blur=3' : url
}

// The carousel only turns while the bar has focus and nothing holds it. A press restarts the countdown.
export const restartCarousel = (bar, step) => {
  stopCarousel(bar)
  const ms = carouselIntervalMs(settings.get('autoAdvance'), settings.get('autoAdvanceInterval'), settings.get('carouselSpeed'))
  if (!bar._focused || shell.saver || ms <= 0 || (bar.items || []).length < 2 || bar.trailerHolding) return
  bar._timer = bar.$setInterval(() => {
    if (onScreen(bar) && !shell.saver) step()
  }, ms)
}

export const stopCarousel = (bar) => {
  if (bar._timer) bar.$clearInterval(bar._timer)
  bar._timer = null
}

const releaseCache = typeof WeakMap === 'function' ? new WeakMap() : null

const NO_RELEASE = { kind: '', season: '', episode: '', tagline: '' }

// A bar keeps its release labels off its reactive state, and relVer says when they changed.
export const loadReleases = (bar) => {
  const n = (bar._relLoad = (bar._relLoad || 0) + 1)
  bar._releases = {}
  bar.relVer++
  releasesFor(bar.items).then((r) => {
    if (n !== bar._relLoad) return
    bar._releases = r || {}
    bar.relVer++
  })
}

// One slide's label as plain fields for NewReleaseLabel.
export const releaseOf = (bar, id) => {
  const r = bar._releases && bar._releases[id]
  if (!r) return NO_RELEASE
  return { kind: r.kind || '', season: r.season == null ? '' : r.season, episode: r.episode == null ? '' : r.episode, tagline: r.tagline || '' }
}

// Loaded once per slide list and shared by whichever bar shows it.
const releasesFor = (items) => {
  const s = settings.all()
  if (!s.mediaBarNewReleaseBanner || !items || !items.length) return Promise.resolve({})
  const key = [s.mediaBarNewReleaseDays, s.mediaBarNewMovieDays, s.mediaBarNewReleaseKinds, s.mediaBarNewMovieDetail].join('|')
  const hit = releaseCache && releaseCache.get(items)
  if (hit && hit.key === key) return hit.p
  const apiFor = (item) => (item._serverUrl && item._serverAccessToken ? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId) : api)
  const p = loadNewReleases(
    items,
    { days: s.mediaBarNewReleaseDays, movieDays: s.mediaBarNewMovieDays, kinds: newReleaseKindsOf(s.mediaBarNewReleaseKinds), tagline: s.mediaBarNewMovieDetail !== false },
    apiFor
  ).catch(() => ({}))
  if (releaseCache) releaseCache.set(items, { key, p })
  return p
}

export { padIndex, rgbA, over, toNum, shade, glowOf, breakable } from './barMath.js'
