// What the hero's facts and ratings lines say.
import $L from '../../../services/i18n.js'
import { arrange } from '../../../utils/buttonLayout.js'
import { DETAIL_METADATA } from '../../../utils/detailMetadataLayout.js'
import { formatDuration } from '../../../utils/helpers.js'
import { isRatingSourceAllowed, isRatingSourceEnabled } from '../../../services/mdblistApi.js'
import { normalizeRatingStyle, personalRatingOf } from '../../../utils/personalRating.js'

// Seerr's status pill colors: fill at 80%, a border of the hue, light ink.
export const SEERR_PILL = {
  green: { fill: '#22c55ecc', border: '#22c55eff', ink: '#d7f5e2ff' },
  yellow: { fill: '#eab308cc', border: '#eab308ff', ink: '#fbf1d3ff' },
  purple: { fill: '#a855f7cc', border: '#a855f7ff', ink: '#f0e3fdff' },
  red: { fill: '#ef4444cc', border: '#ef4444ff', ink: '#fcddddff' },
  gray: { fill: '#ffffff26', border: '#6b7280ff', ink: '#9ca3afff' },
}

// The facts line's pieces in the viewer's Metadata Row order, each {kind, text}.
export const metaPieces = ({ item, settings: s, year, officialRating, runtime, endsAt, seasonCount, genres, episodes, episodeRatings, playlistTracks, upcomingText, seerr }) => {
  const t = item.Type
  const ordered = arrange(DETAIL_METADATA, { order: s.detailMetadataOrderTv, hidden: s.hiddenDetailMetadataTv })
  const pieceFor = (id) => {
    switch (id) {
      case 'year':
        return year ? [{ kind: 'text', text: String(year) }] : []
      case 'parentalRating':
        return officialRating ? [{ kind: 'text', text: officialRating }] : []
      case 'runtimeAndSeasons': {
        if (t === 'Series' && seasonCount) return [{ kind: 'text', text: $L('{count} Seasons').replace('{count}', seasonCount) }]
        if (t === 'Season' && episodes.length) return [{ kind: 'text', text: $L('{count} Episodes').replace('{count}', episodes.length) }]
        if (t === 'Episode' && item.ParentIndexNumber != null && item.IndexNumber != null) {
          let label = `S${item.ParentIndexNumber}:E${item.IndexNumber}`
          const rating = episodeRatings && episodeRatings[item.IndexNumber]
          if (s.tmdbEpisodeRatingsEnabled && isRatingSourceAllowed(s.mdblistRatingSources, 'tmdb') && rating) label += ` · ${rating}`
          return [{ kind: 'text', text: label }]
        }
        if (t === 'Playlist') {
          const count = playlistTracks.length
          const ticks = playlistTracks.reduce((sum, x) => sum + (x.RunTimeTicks || 0), 0)
          const parts = [{ kind: 'text', text: `${count} ${count !== 1 ? $L('Items') : $L('Item')}` }]
          if (ticks > 0) parts.push({ kind: 'runtime', text: formatDuration(ticks) })
          return parts
        }
        if (runtime) return endsAt ? [{ kind: 'runtime', text: runtime }, { kind: 'text', text: endsAt }] : [{ kind: 'runtime', text: runtime }]
        return []
      }
      case 'status':
        if (t === 'Series' && item.Status === 'Continuing') return [{ kind: 'status', text: $L('Continuing') }]
        if (t === 'Series' && item.Status === 'Ended') return [{ kind: 'status', text: $L('Ended'), ended: true }]
        return []
      case 'upcomingEpisodeDate':
        return upcomingText ? [{ kind: 'upcoming', text: upcomingText }] : []
      case 'genres':
        return genres.length ? [{ kind: 'text', text: genres.slice(0, 3).join(' · ') }] : []
      case 'seerrAvailability':
        return seerr && seerr.isActive && seerr.statusPills.length
          ? [{ kind: 'seerr', pills: seerr.statusPills.map((p) => ({ text: p.text, ...(SEERR_PILL[p.color] || SEERR_PILL.gray) })) }]
          : []
      default:
        return []
    }
  }
  return ordered.reduce((acc, def) => acc.concat(pieceFor(def.id)), [])
}

// The ratings line's own values: the viewer's score in their style, the community stars, and the
// server's critic score while the plugin has given nothing.
export const ratingValues = (item, s, pluginRatings) => {
  const personalValue = isRatingSourceEnabled(s, 'personal') ? personalRatingOf(item.UserData) : null
  const personal = personalValue === null ? null
    : normalizeRatingStyle(s.personalRatingStyle) === 'stars' ? `${(personalValue / 2).toFixed(1)}/5` : personalValue.toFixed(1)
  const community = isRatingSourceEnabled(s, 'stars') && item.CommunityRating ? item.CommunityRating.toFixed(1) : null
  const critic = pluginRatings.length === 0 && item.CriticRating != null ? item.CriticRating : null
  const enabled = s.mdblistRatingSources
  const sel = (src) => (src === 'tmdb_episode' ? 'tmdb' : src)
  const plugin = Array.isArray(enabled)
    ? pluginRatings.filter((r) => enabled.indexOf(sel(r.source)) >= 0).sort((a, b) => enabled.indexOf(sel(a.source)) - enabled.indexOf(sel(b.source)))
    : pluginRatings
  return { personal, community, critic, plugin }
}
