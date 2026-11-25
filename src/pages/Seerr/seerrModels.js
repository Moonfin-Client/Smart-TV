// Seerr titles mapped into what SeerrPosterCard draws, and where picking one goes.
import $L from '../../services/i18n.js'
import { getImageUrl } from '../../services/seerrApi.js'
import { libraryIdOf } from '../../utils/seerrTarget.js'
import { fontFor } from '../../ui/text.js'
import { posterMarks } from '../../ui/components/seerr/look.js'

const seerrMediaType = (item) => item.mediaType || item.media_type || (item.title ? 'movie' : 'tv')

export const seerrYear = (item) =>
  String(item.releaseDate || item.release_date || item.firstAirDate || item.first_air_date || '').slice(0, 4)

// What SeerrPosterCard draws for a Seerr title: its w342 poster, type badge, status mark, title and
// the line under it (the year unless subtitle says otherwise). artW sizes a banner's label.
export const posterModel = (item, index, { subtitle, artW = 240, mediaType } = {}) => {
  const title = item.title || item.name || ''
  const sub = subtitle != null ? subtitle : seerrYear(item)
  const poster = item.posterPath || item.poster_path
  const type = item.media_type || item.mediaType || mediaType
  return {
    key: `${type || 'x'}-${item.id}-${index}`,
    idx: index,
    id: item.id,
    title,
    subtitle: sub,
    initial: title.charAt(0),
    titleFont: fontFor(title, 'bold'),
    subtitleFont: fontFor(sub),
    image: (poster && getImageUrl(poster, 'w342')) || '',
    marks: posterMarks(type, item.mediaInfo && item.mediaInfo.status, artW),
    raw: item,
  }
}

// A title the library already holds opens as itself, since the Seerr screen has nothing to play.
export const openSeerrItem = (router, item) => {
  const libraryId = libraryIdOf(item.mediaInfo)
  if (libraryId) router.to(`/details/${libraryId}`)
  else router.to(`/seerr/item/${seerrMediaType(item)}/${item.id}`)
}

// The Seerr shortcuts row, shared by Home and Discover.
export const openSeerrShortcut = (router, key) => {
  if (key === 'discover') router.to('/seerr')
  else if (key === 'movies') router.to('/seerr/browse/all/movie/0', { name: $L('Movies') })
  else if (key === 'series') router.to('/seerr/browse/all/tv/0', { name: $L('Series') })
  else if (key === 'requests' || key === 'issues') router.to('/seerr/requests', { tab: key })
}

// Adult titles stay off the discover rows, going by TMDB's flag or these words.
const NSFW_PATTERNS = [
  /\bsex\b/i, /sexual/i, /\bporn\b/i, /erotic/i, /\bnude\b/i, /nudity/i,
  /\bxxx\b/i, /adult film/i, /prostitute/i, /stripper/i, /\bescort\b/i,
  /seduction/i, /\baffair\b/i, /threesome/i, /\borgy\b/i, /kinky/i,
  /fetish/i, /\bbdsm\b/i, /dominatrix/i,
]
const isNsfw = (item) =>
  !!(item && item.adult) ||
  NSFW_PATTERNS.some((p) => p.test(`${(item && (item.title || item.name)) || ''} ${(item && item.overview) || ''}`))

// Discover rows leave out what's already in the library, what Seerr blocks and adult titles.
export const filterDiscoverItems = (items = []) =>
  items.filter((item) => {
    const status = item && item.mediaInfo && item.mediaInfo.status
    return status !== 4 && status !== 5 && status !== 6 && !isNsfw(item)
  })
