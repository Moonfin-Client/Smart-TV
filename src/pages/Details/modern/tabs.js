// Modern's tabs and how each one's content lays out, as cells with a place in the content box, a
// focus order and a row for Up and Down.
import $L from '../../../services/i18n.js'
import { toCard } from '../../../ui/models.js'
import { cssShift, fontFor } from '../../../ui/text.js'
import { markerPills } from '../../../ui/components/player/animePills.js'
import { markerForEpisode } from '../../../services/animeMarkersApi.js'
import { incompleteRecordingFor } from '../../../services/incompleteRecordings.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { formatDuration, getImageUrl } from '../../../utils/helpers.js'
import { formatPlaybackDuration } from '../../../utils/playbackTimeLabels.js'
import { episodeCardTitle } from '../../../utils/episodeCardTitle.js'
import { reviewMeta, reviewPreview, reviewInitial } from '../../../utils/tmdbReviews.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'

// An item from another server draws its art from there.
const srv = (x) => (x && x._serverUrl) || getServerUrl()
import { castPhotoUrl, hidesMediaDescription } from '../detailsMedia.js'
import { splitAdditionalParts } from '../extraCategories.js'
import { sortLabel } from '../nouveau/nouveauCollectionSort.js'
import { collectionPlaylistItems } from '../collectionPlaylist.js'
import { captionHeight } from './caption.js'

const GRID_GAP = 30
export const MEDIA = { portrait: { w: 240, h: 360, labels: 90 }, square: { w: 240, h: 240, labels: 90 }, landscape: { w: 384, h: 216, labels: 90 } }

// Which tabs show, in order. Each only appears when it has something in it.
export const tabsFor = (d) => {
  const list = []
  const t = d.item.Type
  const isEpisode = t === 'Episode'
  const listsEpisodes = t === 'Season' || (isEpisode && d.showsSection('moreEpisodes'))
  const { parts, others } = splitAdditionalParts(d.extras)
  const showsDetails = d.showsSection('mediaInfo') && (t === 'Book' || (d.supportsMediaSourceSelection && d.mediaSource && d.mediaSource.MediaStreams && d.mediaSource.MediaStreams.length))
  const collectionLabel = d.collectionSections.length > 1 ? $L('Collections') : d.collectionSections[0] && d.collectionSections[0].name
  if (t === 'Series' && d.seasons.length) list.push({ id: 'seasons', label: $L('Seasons') })
  if (listsEpisodes && d.episodes.length) list.push({ id: 'episodes', label: $L('Episodes') })
  if (t === 'Person') {
    if (d.personMovies.length) list.push({ id: 'movies', label: $L('Movies') })
    if (d.personSeries.length) list.push({ id: 'series', label: $L('TV Shows') })
  }
  if ((t === 'MusicAlbum' && d.albumTracks.length) || t === 'Playlist') list.push({ id: 'tracks', label: $L('Tracks') })
  if (t === 'MusicArtist' && d.artistAlbums.length) list.push({ id: 'albums', label: $L('Albums') })
  if (t === 'BoxSet' && d.collectionItems.length) list.push({ id: 'items', label: $L('Items') })
  if (d.bookSeriesItem) list.push({ id: 'books', label: $L('Books') })
  if (d.cast.length) list.push({ id: 'cast', label: $L('Cast') })
  if (d.crew.length) list.push({ id: 'crew', label: $L('Crew') })
  if (d.studios && d.studios.length) list.push({ id: 'studios', label: $L('Studios') })
  if (t === 'BoxSet' && d.showsSection('playlistOrder')) list.push({ id: 'collectionPlaylist', label: $L('Playlist') })
  if (d.chapters && d.chapters.length) list.push({ id: 'chapters', label: $L('Chapters') })
  if (parts.length) list.push({ id: 'additionalParts', label: $L('Additional Parts') })
  if (others.length) list.push({ id: 'extras', label: $L('Extras') })
  if (showsDetails && !d.bookSeriesItem) list.push({ id: 'details', label: $L('Details') })
  if (d.collectionSections.length) list.push({ id: 'collection', label: collectionLabel })
  if (d.similar.length) list.push({ id: 'similar', label: $L('More Like This') })
  if (d.reviews.length) list.push({ id: 'reviews', label: $L('Reviews') })
  if (d.seerr.hasTabContent) list.push({ id: 'seerr', label: d.seerr.displayName })
  return list
}

// Equal cells wrapped into rows across the content width.
const flow = (cells, width, cellW, top, heightOf) => {
  const perRow = Math.max(1, Math.floor((width + GRID_GAP) / (cellW + GRID_GAP)))
  let y = top
  for (let start = 0, row = 0; start < cells.length; start += perRow, row++) {
    const rowCells = cells.slice(start, start + perRow)
    const h = Math.max(...rowCells.map(heightOf))
    rowCells.forEach((c, i) => {
      c.x = i * (cellW + GRID_GAP)
      c.y = y
      c.row = c.row == null ? row : c.row
    })
    y += h + GRID_GAP
  }
  return cells.length ? y - GRID_GAP : top
}

const centeredLines = (str, size, weight, boxW, maxLines, lh) => {
  let lines = []
  String(str || '').split('\n').forEach((para) => {
    lines = lines.concat(wrapLines(para, size, weight, boxW))
  })
  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    let last = lines[maxLines - 1]
    while (last && textWidth(`${last}…`, size, weight) > boxW) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last.trimEnd ? last.trimEnd() : last}…`
  }
  return lines.map((t, i) => ({ t, x: (boxW - textWidth(t, size, weight)) / 2, y: i * lh, font: fontFor(t, weight) }))
}

const mediaCells = (items, type, startIdx) => items.map((it, i) => {
  const size = MEDIA[type] || MEDIA.portrait
  const card = toCard(it, type === 'portrait' ? 'poster' : type, i)
  // A title only Seerr knows of carries its TMDB poster instead of server artwork.
  if (!card.image && it._externalPosterUrl) card.image = it._externalPosterUrl
  return { k: `c${startIdx + i}-${it.Id || i}`, kind: 'card', idx: startIdx + i, w: size.w, h: size.h + captionHeight(it), cardW: size.w, cardH: size.h, card, item: it }
})

const peopleCells = (people) => people.map((p, i) => {
  const name = centeredLines(p.Name, 20, 'bold', 160, 0, 33)
  const role = p.Role ? centeredLines(p.Role, 18, 'regular', 160, 3, 33) : []
  const h = 140 + 10 + name.length * 33 + (role.length ? 10 + role.length * 33 : 0)
  return { k: `p${i}-${p.Id || p.Name}`, kind: 'person', idx: i, w: 160, h, photo: castPhotoUrl(p, srv(p), 300) || '', name, role, roleY: 150 + name.length * 33 + 10, item: p }
})

const chapterCells = (item) => (item.Chapters || []).map((ch, i) => {
  const name = ch.Name || `${$L('Chapter')} ${i + 1}`
  const thumb = ch.ImageTag ? getImageUrl(srv(item), item.Id, `Chapter/${i}`, { maxWidth: 400, tag: ch.ImageTag }) : ''
  const time = formatPlaybackDuration((ch.StartPositionTicks || 0) / 10000000)
  return {
    k: `ch${i}`, kind: 'chapter', idx: i, w: 300, h: 168.75 + 8 + 33, thumb, name, nameFont: fontFor(name), time, timeW: 16 + textWidth(time, 18),
    ticks: ch.StartPositionTicks || 0,
  }
})

const extraCells = (extras) => extras.map((x, i) => {
  const thumb = x.ImageTags && x.ImageTags.Primary ? getImageUrl(srv(x), x.Id, 'Primary', { maxWidth: 400, quality: 80 }) : ''
  return { k: `x${i}-${x.Id}`, kind: 'chapter', idx: i, w: 300, h: 168.75 + 8 + 33, thumb, name: x.Name || '', nameFont: fontFor(x.Name || ''), time: '', timeW: 0, item: x }
})

const studioCells = (studios) => studios.map((s, i) => ({
  k: `s${i}-${s.key}`, kind: 'studio', idx: i, w: 240, h: 130 + 12 + 33 * Math.max(1, wrapLines(s.name, 20, 'regular', 240).length),
  logo: s.logo || '', name: centeredLines(s.name, 20, 'regular', 240, 0, 33), studioName: s.name,
}))

const reviewCells = (reviews) => reviews.map((r, i) => {
  const preview = reviewPreview(r.content)
  return {
    k: `rv${i}-${r.id}`, kind: 'review', idx: i, w: 520, h: 250, review: r, author: r.author || '', authorFont: fontFor(r.author || '', 'bold'),
    meta: reviewMeta(r), initial: reviewInitial(r.author), avatar: r.avatarUrl || '', preview, previewFont: fontFor(preview),
  }
})

// The episodes of the season, a row each: the still, its number and name, the runtime and two lines
// of overview, the current episode ringed.
const episodeCells = (episodes, current, s, width, animeSeries) => {
  const rowW = Math.min(1600, width)
  const bodyW = rowW - 24 - 260 - 24
  let y = 0
  return episodes.map((ep, i) => {
    const name = episodeCardTitle(ep.Name, ep.IndexNumber)
    const runtime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : ''
    const overview = ep.Overview && !hidesMediaDescription(ep, s) ? ep.Overview : ''
    const ovLines = overview ? Math.min(2, wrapLines(overview, 20, 'regular', bodyW).length) : 0
    // The anime marker pills sit between the runtime and the overview and take their 8px gap even
    // when there are none. They're the large size: 19px at 1.5 with 3px and a 1px border above and below.
    const pills = markerPills(markerForEpisode(animeSeries, ep.Id), null, false, true)
    let x = 0
    pills.forEach((p) => {
      p.x = x
      x += p.w + 8
    })
    const pillsH = pills.length ? 36.5 : 0
    let bodyH = 6 + 33
    if (runtime) bodyH += 8 + 33
    bodyH += 8 + pillsH
    if (ovLines) bodyH += 8 + ovLines * 28
    // The still's own shape sets the row's height when it's taller than the text beside it.
    const thumbH = Math.max(bodyH, ep.ImageTags && ep.ImageTags.Primary ? 260 / (ep.PrimaryImageAspectRatio || 16 / 9) : 0)
    const h = 24 + thumbH
    const cell = {
      k: `e${i}-${ep.Id}`, kind: 'episode', idx: i, x: 0, y, w: rowW, h, row: i, thumbH,
      thumb: ep.ImageTags && ep.ImageTags.Primary ? getImageUrl(srv(ep), ep.Id, 'Primary', { maxWidth: 400, quality: 80 }) : '',
      name, nameFont: fontFor(name, 'bold'), runtime, overview, overviewFont: fontFor(overview), bodyW,
      ovY: 12 + 6 + 33 + (runtime ? 8 + 33 : 0) + 8 + pillsH + 8, ovLines, pills, incomplete: Boolean(incompleteRecordingFor(ep.Id)),
      incompleteX: 296 + (runtime ? textWidth(runtime, 20) + 10 : 0), incompleteY: runtime ? 12 + 6 + 33 + 8 + 5 : 12 + 6 + 5, pillsY: 12 + 6 + 33 + (runtime ? 8 + 33 : 0) + 8,
      played: !!(ep.UserData && ep.UserData.Played), progress: Math.min(100, (ep.UserData && ep.UserData.PlayedPercentage) || 0) / 100,
      current: !!(current && current.Id === ep.Id), item: ep,
    }
    y += h + 16
    return cell
  })
}

const trackCells = (tracks, { numbered, label }) => {
  let y = 0
  return tracks.map((tr, i) => {
    const title = label ? label(tr) : tr.Name || ''
    const duration = tr.RunTimeTicks ? formatDuration(tr.RunTimeTicks) : ''
    const index = String(numbered ? i + 1 : tr.IndexNumber || i + 1)
    const cell = {
      k: `t${i}-${tr.PlaylistItemId || tr.Id}`, kind: 'track', idx: i, x: 0, y, w: 900, h: 14 + 33 + 14, row: i,
      index, title, titleFont: fontFor(title), duration, durationX: 900 - 20 - textWidth(duration, 20), item: tr,
    }
    y += cell.h + 4
    return cell
  })
}

// One tab's cells and height. `sections` stacks headed grids (several collections, Seerr's rows).
export const layoutTab = (id, d) => {
  const width = d.contentW
  const out = { cells: [], headings: [], height: 0, kind: 'grid' }
  const grid = (items, type, top = 0, startIdx = 0, rowBase = 0) => {
    const cells = mediaCells(items, type, startIdx)
    const size = MEDIA[type] || MEDIA.portrait
    const bottom = flow(cells, width, size.w, top, (c) => c.h)
    cells.forEach((c) => (c.row += rowBase))
    return { cells, bottom }
  }
  const put = (cells, bottom) => {
    out.cells = cells
    out.height = bottom
  }
  switch (id) {
    case 'seasons': {
      const g = grid(d.seasons, 'portrait')
      g.cells.forEach((c) => {
        const marker = d.seasonMarker(c.item)
        if (marker) c.marker = marker
      })
      put(g.cells, g.bottom)
      break
    }
    case 'episodes': {
      const cells = episodeCells(d.episodes, d.item.Type === 'Episode' ? d.item : null, d.settings, width, d.animeSeries)
      out.kind = 'list'
      put(cells, cells.length ? cells[cells.length - 1].y + cells[cells.length - 1].h : 0)
      break
    }
    case 'movies': return (put(...Object.values(grid(d.personMovies, 'portrait'))), out)
    case 'series': return (put(...Object.values(grid(d.personSeries, 'portrait'))), out)
    case 'albums': return (put(...Object.values(grid(d.artistAlbums, 'square'))), out)
    case 'items': return (put(...Object.values(grid(d.collectionItems, 'portrait'))), out)
    case 'similar': return (put(...Object.values(grid(d.similar, 'portrait'))), out)
    case 'books': return (put(...Object.values(grid(d.books || [], 'portrait'))), out)
    case 'collection': {
      if (d.collectionSections.length === 1) return (put(...Object.values(grid(d.collectionSections[0].items, 'portrait'))), out)
      let top = 0
      let idx = 0
      let rowBase = 0
      const cells = []
      d.collectionSections.forEach((section, si) => {
        out.headings.push({ k: `h${si}`, x: 0, y: top, text: section.name, font: fontFor(section.name, 'bold') })
        const g = grid(section.items, 'portrait', top + 29 + 12, idx, rowBase)
        g.cells.forEach((c) => (c.section = si))
        cells.push(...g.cells)
        idx += g.cells.length
        rowBase = (g.cells.length ? g.cells[g.cells.length - 1].row : rowBase) + 1
        top = g.bottom + 32
      })
      put(cells, top - 32)
      break
    }
    case 'cast':
    case 'crew': {
      const cells = peopleCells(id === 'cast' ? d.cast : d.crew)
      put(cells, flow(cells, width, 160, 0, (c) => c.h))
      break
    }
    case 'chapters': {
      const cells = chapterCells(d.item)
      put(cells, flow(cells, width, 300, 0, (c) => c.h))
      break
    }
    case 'additionalParts':
    case 'extras': {
      const { parts, others } = splitAdditionalParts(d.extras)
      const cells = extraCells(id === 'extras' ? others : parts)
      put(cells, flow(cells, width, 300, 0, (c) => c.h))
      break
    }
    case 'studios': {
      const cells = studioCells(d.studioCards)
      put(cells, flow(cells, width, 240, 0, (c) => c.h))
      break
    }
    case 'reviews': {
      const cells = reviewCells(d.reviews)
      put(cells, flow(cells, width, 520, 0, () => 250))
      break
    }
    case 'tracks': {
      out.kind = 'list'
      const cells = trackCells(d.tracks, { numbered: d.item.Type === 'Playlist' })
      const bar = d.playlistBar
      if (!bar) {
        put(cells, cells.length ? cells[cells.length - 1].y + cells[cells.length - 1].h : 0)
        break
      }
      // The sort and filter bar above the rows: the sort, the filter with its count, and Reset once
      // either is changed.
      const pills = []
      let x = 0
      const pill = (id, label, active, badge) => {
        const w = 2 + 36 + textWidth(label, 16, 'medium') + (badge ? 8 + 16 + textWidth(String(badge), 13, 'bold') : 0)
        pills.push({ k: `pill-${id}`, kind: 'pill', id, idx: pills.length, x, y: 16, w, h: 37, row: 0, label, font: fontFor(label, 'medium'), active, badge: badge ? String(badge) : '', badgeX: 19 + textWidth(label, 16, 'medium') + 8, badgeW: 16 + textWidth(String(badge || ''), 13, 'bold') })
        x += w + 12
      }
      pill('sort', bar.sortText, bar.sortActive, 0)
      pill('filter', $L('Filter'), bar.filterCount > 0, bar.filterCount)
      if (bar.modified) pill('reset', $L('Reset'), false, 0)
      const top = 16 + 37 + 20 + 16
      cells.forEach((c) => {
        c.idx += pills.length
        c.row += 1
        c.y += top
      })
      // The empty states: an icon over the message, 16px apart in 56px of padding, and Clear Filters
      // under them when filters hid every entry.
      if (bar.empty) {
        const icon = bar.emptyFiltered ? '\u2298' : '\ud83c\udfb5'
        const empty = {
          k: 'empty', kind: 'empty', idx: -1, x: 0, y: top, w: 900, h: bar.emptyFiltered ? 266 : 209, text: bar.empty, font: fontFor(bar.empty),
          // The glyph comes from a fallback face, so it gets a taller line to keep its top.
          icon, iconFont: fontFor(icon, 'regular'), iconX: (900 - textWidth(icon, 48)) / 2, iconY: 56 - 12 + cssShift(48),
        }
        const out2 = pills.concat(empty)
        if (bar.emptyFiltered) {
          const label = $L('Clear Filters')
          const w = 2 + 48 + textWidth(label, 16, 'bold')
          out2.push({ k: 'clear', kind: 'clear', id: 'reset', idx: pills.length, row: 1, x: (900 - w) / 2, y: top + 169, w, h: 41, label, font: fontFor(label, 'bold') })
        }
        put(out2, top + empty.h)
        break
      }
      put(pills.concat(cells), cells.length ? cells[cells.length - 1].y + cells[cells.length - 1].h : top)
      break
    }
    case 'collectionPlaylist': {
      out.kind = 'list'
      const label = sortLabel(d.collectionSort)
      const sortW = 3 + 24 + textWidth(label, 20, 'medium') + 24 + 3
      const sort = { k: 'sort', kind: 'sort', idx: 0, x: 0, y: 0, w: sortW, h: 54, row: 0, label, font: fontFor(label, 'medium') }
      const entries = collectionPlaylistItems(d.playlistItems, d.collectionItems)
      const cells = trackCells(entries, { numbered: true, label: (e) => (e.SeriesName ? `${e.SeriesName} · ${e.Name}` : e.Name || '') })
      cells.forEach((c) => {
        c.idx += 1
        c.row += 1
        c.y += 54 + 16
      })
      const all = [sort].concat(cells)
      put(all, cells.length ? cells[cells.length - 1].y + cells[cells.length - 1].h : 54 + 16 + (d.collectionPlaylistLoading ? 160 : 0))
      break
    }
    default:
      break
  }
  return out
}
