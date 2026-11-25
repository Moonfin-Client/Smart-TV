import $L from '../../../services/i18n.js'
import { textWidth } from '../../../ui/components/details/measure.js'
import { cssShift, fontFor } from '../../../ui/text.js'
import { isSeerrOnlyItem } from '../../../utils/seerrTarget.js'
import { SEASON_GAP, seasonCardShare } from './quickLookRules.js'

export const SEASON_H = 73.5
// Each card's border is 1px wide.
const EDGE = 1

// Quick Look's season cards across `w`, up to three across with a fourth peeking in from the edge.
// A show only in Seerr lists Seerr's seasons with their dots. The gaps come off the row's width but
// aren't placed, so the cards touch. `dotFor(status)` gives a Seerr dot's look, or null.
export const seasonCards = (bag, w, dotFor) => {
  const seerrOnly = isSeerrOnlyItem(bag.item)
  const sr = bag.seerr || {}
  const markers = bag.settings.showSeerrAvailabilityBadges !== false ? sr.seasonMarkers : null
  const rows = seerrOnly
    ? ((sr.details && sr.details.seasons) || []).filter((season) => season.seasonNumber > 0).map((season) => ({
      k: `s${season.seasonNumber}`, number: season.seasonNumber, total: 0, played: 0,
      name: season.name || $L('Season {number}').replace('{number}', season.seasonNumber),
    }))
    : (bag.lists.seasons || []).map((season) => {
      const total = season.ChildCount || 0
      const ud = season.UserData || {}
      return { k: season.Id, raw: season, name: season.Name || '', total, played: total - (ud.UnplayedItemCount != null ? ud.UnplayedItemCount : total) }
    })
  if (!rows.length) return []
  const share = seasonCardShare(rows.length)
  const cw = (w - SEASON_GAP * share.gaps) / share.parts
  const inner = SEASON_H - 2 * EDGE
  return rows.map((s, i) => {
    const count = s.total > 0 ? $L('{played} of {total}').replace('{played}', s.played).replace('{total}', s.total) : ''
    const countW = count ? textWidth(count, 20) : 0
    const slotW = seerrOnly ? 10 + 23.4 : 0
    const room = cw - 2 * (EDGE + 20)
    const nameW = Math.max(0, room - (count ? 10 + countW : 0) - slotW)
    const head = s.total > 0 ? 33 + 8.4 + 5 : 33
    const top = EDGE + (inner - head) / 2
    const dot = seerrOnly && markers ? dotFor(markers.get(s.number)) : null
    return {
      ...s, i, x: i * cw, w: cw, edge: EDGE, count, countX: cw - EDGE - 20 - countW - slotW, nameW: nameW + 1, textY: top + cssShift(20),
      trackY: top + 33 + 8.4, trackW: room, share: s.total ? s.played / s.total : 0, font: fontFor(s.name, 'bold'), countFont: fontFor(count, 'regular'),
      dot: dot ? { ...dot, src: `icons/${dot.icon}.webp` } : null, dotX: cw - EDGE - 20 - 23.4, dotY: top + (33 - 23.4) / 2,
    }
  })
}
