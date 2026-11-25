// The rows of cards Stage, Premiere and Quick Look show: a collection's own titles, a row for each
// kind it holds, then the cast, extras, the collections the title belongs to, more like it and
// Seerr's two lists. Each comes back as the config StageRail.draw() takes, less the width.
import $L from '../../../services/i18n.js'
import { castPhotoUrl } from '../detailsMedia.js'
import { spotlightItemImageUrl } from '../spotlight/spotlightImages.js'
import { nouveauCardImageUrl } from '../nouveau/nouveauCardImage.js'
import { seerrBadgeStyle, statusDot } from '../../../ui/components/seerr/look.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { MEDIA_STATUS } from '../../../utils/seerrStatus.js'
import { isSeerrOnlyItem } from '../../../utils/seerrTarget.js'
import { collectionGroups } from './stageRules.js'

const POSTER_ROOM = { gap: 36, clearance: 58, bleed: 30, titleGap: 72 }
const CAST_ROOM = { gap: 27, clearance: 10, bleed: 10, titleGap: 20 }
const EXTRAS_ROOM = { gap: 30, clearance: 32, bleed: 30, titleGap: 39 }

const unownedStatus = (entry) => {
  const status = entry && entry._seerr && !entry._external && entry.mediaInfo ? entry.mediaInfo.status : null
  return status >= MEDIA_STATUS.PENDING && status <= MEDIA_STATUS.AVAILABLE ? status : null
}

const poster = (server, s, seerrCard) => (entry, i) => {
  const ud = entry.UserData || {}
  const played = ud.PlayedPercentage
  const status = seerrCard && seerrBadgeStyle(s) === 'badge' && s.showSeerrAvailabilityBadges !== false ? unownedStatus(entry) : null
  return {
    k: `${entry.cardKey || entry.Id || i}`, raw: entry, title: entry.Name || '', img: spotlightItemImageUrl(server, entry) || '',
    fav: Boolean(ud.IsFavorite), played: Boolean(ud.Played), progress: played > 0 && played < 100 ? played / 100 : 0,
    missing: Boolean(entry._seerrMissing), dot: status ? statusDot(status, 37) : null,
  }
}

export const rowStops = (v) => {
  const s = v.settings
  const server = v.server
  const sr = v.seerr || {}
  const pieces = sr.pieces || {}
  const rows = []
  if ((v.cast || []).length) {
    rows.push({
      id: 'stage-cast', title: $L('Cast'), kind: 'person', ...CAST_ROOM,
      entries: v.cast.map((p, i) => ({
        k: `${p.Id || p.Name}-${i}`, raw: p, title: p.Name || '', img: castPhotoUrl(p, server, 400) || '',
        subtitle: p.Role ? String(p.Role).split('\n').filter(Boolean).join(', ') : '',
      })),
    })
  }
  if ((v.extras || []).length) {
    rows.push({
      id: 'stage-extras', title: $L('Extras'), kind: 'extra', ...EXTRAS_ROOM,
      entries: v.extras.map((x, i) => ({ k: `${x.Id || i}`, raw: x, title: x.Name || '', placeholder: x.Name || '', img: nouveauCardImageUrl(server, x, { fallbackUrl: v.backdropUrl }) || '' })),
    })
  }
  ;(v.collectionSections || []).forEach((section, index) => {
    if (section.items.length) rows.push({ id: `stage-collection-${index}`, title: section.name, kind: 'poster', ...POSTER_ROOM, entries: section.items.map(poster(server, s, false)), menu: true })
  })
  if ((v.similar || []).length) rows.push({ id: 'stage-similar', title: $L('More Like This'), kind: 'poster', ...POSTER_ROOM, entries: v.similar.map(poster(server, s, false)), menu: true })
  if (pieces.chips || pieces.facts || pieces.streaming) rows.push({ id: 'stage-seerr', block: true })
  if (pieces.recommendations) {
    rows.push({ id: 'stage-seerr-recommendations', title: `${sr.displayName} · ${$L('Recommendations')}`, kind: 'poster', ...POSTER_ROOM, entries: (sr.recommendationCards || []).map(poster(server, s, true)) })
  }
  if (pieces.similar) {
    rows.push({ id: 'stage-seerr-similar', title: `${sr.displayName} · ${$L('Similar')}`, kind: 'poster', ...POSTER_ROOM, entries: (sr.similarCards || []).map(poster(server, s, true)) })
  }
  return rows
}

// A show only in Seerr, its seasons as cards that each open the request sheet on that season: its
// TMDB poster, or its name on a plain card, its episode count and its Seerr dot.
// shortcut: no banner on a season card with the Banner badge style, add it when StageRail draws banners.
export const seerrSeasonsStop = (v) => {
  const sr = v.seerr || {}
  const type = v.item && v.item.Type
  if (!isSeerrOnlyItem(v.item) || (type !== 'Series' && type !== 'Season' && type !== 'Episode')) return null
  const seasons = ((sr.details && sr.details.seasons) || []).filter((season) => season.seasonNumber > 0)
  if (!seasons.length) return null
  const style = seerrBadgeStyle(v.settings)
  return {
    id: 'stage-seasons', title: $L('Seasons'), kind: 'poster', ...POSTER_ROOM, gap: 20,
    entries: seasons.map((season) => {
      const name = season.name || $L('Season {number}').replace('{number}', season.seasonNumber)
      const status = style === 'badge' && sr.seasonMarkers ? sr.seasonMarkers.get(season.seasonNumber) : null
      return {
        k: `season-${season.seasonNumber}`, raw: { seasonNumber: season.seasonNumber }, title: name, placeholder: name,
        subtitle: season.episodeCount ? String(season.episodeCount) : '', img: season.posterPath ? seerrApi.getImageUrl(season.posterPath, 'w342') : '',
        dot: status ? statusDot(status, 33) : null,
      }
    }),
  }
}

// A collection's own titles, a row for each kind it holds. They load a page at a time.
export const collectionStops = (v) => collectionGroups(v.item, v.collectionItems || []).map((group) => ({
  id: `stage-collection-items-${group.id}`, title: group.title, kind: 'poster', ...POSTER_ROOM,
  entries: group.items.map(poster(v.server, v.settings, false)), menu: true, nearEnd: true,
}))
