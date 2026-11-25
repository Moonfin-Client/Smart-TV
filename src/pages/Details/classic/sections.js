// Classic's sections under the header, each a row the page stacks 36px apart:
// Next Up, seasons, the next episode, the season's episodes, a box set's titles, chapters, extras,
// cast, the collections a title is in, More Like This, reviews and the Seerr pieces. Every row is
// laid out flat here, its cells placed from the left edge of the content, so ClassicRow only draws.
import $L from '../../../services/i18n.js'
import { fontFor } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { toCard } from '../../../ui/models.js'
import { classicCard } from '../../../ui/components/home/cards.js'
import { statusDot, seerrBadgeStyle, hasSeerrDot } from '../../../ui/components/seerr/look.js'
import { formatDuration, getImageUrl } from '../../../utils/helpers.js'
import { formatPlaybackDuration } from '../../../utils/playbackTimeLabels.js'
import { showsWatchedCheck } from '../../../utils/playedState.js'
import { reviewMeta, reviewPreview, reviewInitial } from '../../../utils/tmdbReviews.js'
import { buildMediaFacts } from '../../../utils/seerrMediaFacts.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { castPhotoUrl, hidesMediaDescription, seriesThumbUrl } from '../detailsMedia.js'
import { clip } from './layout.js'
import { splitAdditionalParts } from '../extraCategories.js'
import { markerPills } from '../../../ui/components/player/animePills.js'
import { markerForEpisode } from '../../../services/animeMarkersApi.js'

const EPISODE_THUMB = { maxWidth: 400, quality: 80 }
const CHAPTER_THUMB = { maxWidth: 400, quality: 90 }
const HEADER = 49
const SCROLL_PAD = 20

// A row of cards in a plain scroller: cells from the left edge, `gap` apart.
export const scrollRowFor = (k, kind, title, cells, gap, extra) => {
  let x = 0
  cells.forEach((c) => {
    c.x = x
    x += c.w + gap
  })
  const cardH = cells.reduce((m, c) => Math.max(m, c.h), 0)
  return {
    k, kind, title, titleSize: 32, titleX: 0, cardsY: HEADER + SCROLL_PAD, h: HEADER + SCROLL_PAD * 2 + cardH,
    clipX: -SCROLL_PAD, clipPad: SCROLL_PAD, cells, contentW: Math.max(0, x - gap), mode: 'scroll', entry: 0, ...extra,
  }
}

const MEDIA_SIZE = { portrait: [240, 360], landscape: [384, 216] }
const mediaCell = (k, it, i, extraCard, type = 'portrait') => {
  const [w, h] = MEDIA_SIZE[type] || MEDIA_SIZE.portrait
  const card = toCard(it, type === 'landscape' ? 'landscape' : 'poster', i)
  if (!card.image && it._externalPosterUrl) card.image = it._externalPosterUrl
  const line2 = classicCard(it, i, { s: extraCard.s, cardType: type, imageType: type === 'landscape' ? 'thumb' : 'poster', plain: true }).line2
  return { k: `${k}${i}-${it.Id || i}`, kind: 'media', idx: i, w, h: h + (line2 ? 86 : 53), cardW: w, cardH: h, cardType: type, card, item: it, seerr: !!it._seerr }
}

// A media row: its own 60px inset, a 28px title, cards 24px apart in a lane that glides each
// focused card to the start, and 30px under it that the next row's 36 doesn't swallow.
export const mediaRowFor = (k, title, items, s, contentW, type = 'portrait') => {
  const cells = items.map((it, i) => mediaCell(k, it, i, { s }, type))
  let x = 60
  cells.forEach((c) => {
    c.x = x
    x += c.w + 24
  })
  const cardH = cells.reduce((m, c) => Math.max(m, c.h), 0)
  return {
    k, kind: 'media', title, titleSize: 28, titleX: 60, cardsY: HEADER + SCROLL_PAD, h: HEADER + SCROLL_PAD * 2 + cardH,
    clipX: 40, clipW: contentW - 80, clipPad: SCROLL_PAD, cells, mode: 'glide', entry: 0, marginTop: 40, marginBottom: 30,
  }
}

const nextUpRow = (k, title, ep, server, s, contentW, animeSeries) => {
  const seriesThumb = s.detailUseSeriesThumbnails ? seriesThumbUrl(server, ep, EPISODE_THUMB) : null
  const thumb = seriesThumb || (ep.ImageTags && ep.ImageTags.Primary ? getImageUrl(server, ep.Id, 'Primary', EPISODE_THUMB) : '')
  const label = ep.ParentIndexNumber != null && ep.IndexNumber != null ? `S${ep.ParentIndexNumber}:E${ep.IndexNumber}` : ''
  const name = label ? `${label} - ${ep.Name || ''}` : ep.Name || ''
  const overview = !hidesMediaDescription(ep, s) && ep.Overview ? ep.Overview : ''
  const textW = contentW - 2 - 300 - 40 - 80
  const ovLines = overview ? Math.min(3, wrapLines(overview, 18, 'regular', textW).length) : 0
  // The anime markers at their default size sit under the title, 6px apart like the rest of the column.
  let px = 0
  const pills = markerPills(markerForEpisode(animeSeries, ep.Id), null, false).map((p) => {
    const out = { ...p, x: px }
    px += p.w + 8
    return out
  })
  const pillsH = pills.length ? 28.5 : 0
  const blockH = 33 + (pillsH ? 6 + pillsH : 0) + (ovLines ? 6 + ovLines * 24.3 : 0)
  const nameY = (171 - blockH) / 2
  const cell = {
    k: `${k}0`, kind: 'nextup', idx: 0, x: 0, w: contentW, h: 171, item: ep, thumb, name: clip(name, 18, 'bold', textW), nameFont: fontFor(name, 'bold'), textW,
    overview, overviewFont: fontFor(overview), ovLines, nameY, ovY: nameY + 39 + (pillsH ? pillsH + 6 : 0), pills, pillsX: 321, pillsY: nameY + 39, pillSize: 'normal',
    progress: Math.min(100, (ep.UserData && ep.UserData.PlayedPercentage) || 0) / 100,
  }
  return { k, kind: 'nextup', title, titleSize: 32, titleX: 0, cardsY: HEADER, h: HEADER + 171, clipX: 0, cells: [cell], contentW, mode: 'none', entry: 0 }
}

const seasonCells = (seasons, server, s, seerr) => {
  const style = seerrBadgeStyle(s)
  return seasons.map((season, i) => {
    const played = showsWatchedCheck(season)
    const unplayed = (season.UserData && season.UserData.UnplayedItemCount) || 0
    const status = seerr && seerr.seasonMarkers ? seerr.seasonMarkers.get(season.IndexNumber) : null
    const banner = style === 'banner' && hasSeerrDot(status)
    const dot = style === 'badge' && status ? statusDot(status, 28) : null
    const name = season.Name || ''
    const nameW = Math.min(180, textWidth(name, 18))
    return {
      k: `sn${i}-${season.Id}`, kind: 'season', idx: i, w: 224, h: 375, item: season, name: clip(name, 18, 'regular', 180), nameFont: fontFor(name), nameX: (224 - nameW) / 2,
      img: season.ImageTags && season.ImageTags.Primary ? getImageUrl(server, season.Id, 'Primary', { maxHeight: 350, quality: 80 }) : '',
      played, unplayed: !played && unplayed > 0 ? String(unplayed) : '', countW: Math.max(24, textWidth(String(unplayed), 14, 'bold')) + 15,
      markY: banner ? 28 : 8, dot,
    }
  })
}

// The anime markers at their compact size (13px, 1 by 9 padding, 8 apart), placed from 0, and how
// wide they run together.
export const compactAnimePills = (series, ep) => {
  let x = 0
  const pills = markerPills(markerForEpisode(series, ep.Id), null, true).map((p) => {
    const out = { ...p, x }
    x += p.w + 8
    return out
  })
  return { pills, w: pills.length ? x - 8 : 0 }
}

const episodeCells = (episodes, item, server, s, ratings, animeSeries) => episodes.map((ep, i) => {
  const seriesThumb = s.detailUseSeriesThumbnails ? seriesThumbUrl(server, ep, EPISODE_THUMB) || seriesThumbUrl(server, item, EPISODE_THUMB) : null
  const thumb = seriesThumb || (ep.ImageTags && ep.ImageTags.Primary ? getImageUrl(server, ep.Id, 'Primary', EPISODE_THUMB) : '')
  const num = `E${ep.IndexNumber || '?'}`
  const runtime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : ''
  const rating = ratings && ratings[ep.IndexNumber] != null ? Number(ratings[ep.IndexNumber]).toFixed(1) : ''
  const numW = textWidth(num, 15, 'bold')
  const runW = runtime ? textWidth(runtime, 14) : 0
  const rateW = rating ? 17 + textWidth(rating, 14) : 0
  // The markers hold their width beside the runtime and the rating, and the name gives way.
  const anime = compactAnimePills(animeSeries, ep)
  const nameW = 300 - 24 - numW - 8 - (runtime ? runW + 8 : 0) - (rating ? rateW + 8 : 0) - (anime.w ? anime.w + 8 : 0)
  const ud = ep.UserData || {}
  return {
    pills: anime.pills, pillsX: 1 + 12 + numW + 8 + Math.max(0, nameW) + 8 + (runtime ? runW + 8 : 0) + (rating ? rateW + 8 : 0), pillsY: 198 - 23.5 / 2,
    k: `ep${i}-${ep.Id}`, kind: 'episode', idx: i, w: 302, h: 224, item: ep, thumb, num, numW, name: nameW > textWidth('…', 17) ? clip(ep.Name || '', 17, 'regular', nameW) : '', nameFont: fontFor(ep.Name || ''),
    nameW: Math.max(0, nameW), runtime, runX: 12 + numW + 8 + Math.max(0, nameW) + 8, rating, rateX: 12 + numW + 8 + Math.max(0, nameW) + 8 + (runtime ? runW + 8 : 0),
    progress: Math.min(100, ud.PlayedPercentage || 0) / 100, played: !!ud.Played, fav: !!ud.IsFavorite, current: ep.Id === item.Id,
  }
})

const thumbCells = (k, kind, entries) => entries.map((e, i) => {
  const timeW = e.time ? textWidth(e.time, 14) + 8 : 0
  return {
    k: `${k}${i}`, kind: 'chapter', idx: i, w: 282, h: 213, item: e.item, ticks: e.ticks, chapterKind: kind, thumb: e.thumb, name: clip(e.name, 16, 'regular', 280 - 24 - timeW),
    nameFont: fontFor(e.name), nameW: 280 - 24 - timeW, time: e.time, timeX: 280 - 12 - (timeW ? timeW - 8 : 0),
  }
})

// The cards for a list of extras or parts.
export const thumbEntries = (k, kind, list, server) => thumbCells(k, kind, list.map((x) => ({
  name: x.Name || '', item: x, time: x.RunTimeTicks ? formatDuration(x.RunTimeTicks) : '',
  thumb: x.ImageTags && x.ImageTags.Primary ? getImageUrl(server, x.Id, 'Primary', { maxWidth: 400, quality: 80 }) : '',
})))

const castCells = (cast, server) => cast.map((p, i) => {
  const name = p.Name || ''
  const role = p.Role || p.Type || ''
  const nameW = Math.min(145, textWidth(name, 17, 'bold'))
  const roleW = Math.min(145, textWidth(role, 16))
  return {
    k: `p${i}-${p.Id}`, kind: 'cast', idx: i, w: 145, h: 216, item: p, photo: castPhotoUrl(p, server, 280) || '',
    initial: name.charAt(0), name: clip(name, 17, 'bold', 145), nameFont: fontFor(name, 'bold'), nameX: (145 - nameW) / 2, role: clip(role, 16, 'regular', 145), roleFont: fontFor(role), roleX: (145 - roleW) / 2,
  }
})

const reviewCells = (reviews) => reviews.map((r, i) => {
  // The preview reads as one paragraph, with runs of whitespace collapsed.
  const preview = reviewPreview(r.content).replace(/\s+/g, ' ')
  return {
    k: `rv${i}-${r.id}`, kind: 'review', idx: i, w: 520, h: 250, review: r, author: r.author || '', authorFont: fontFor(r.author || '', 'bold'),
    meta: reviewMeta(r), initial: reviewInitial(r.author), avatar: r.avatarUrl || '', preview, previewFont: fontFor(preview),
  }
})

// Seerr's Genres and Tags chip, its collection banner, and the facts card with where it streams.
const seerrRows = (sr) => {
  const out = []
  const d = sr.details
  if (sr.pieces && sr.pieces.chips) {
    const label = $L('Genres and Tags')
    const w = 40 + textWidth(label, 14)
    out.push({
      k: 'chips', kind: 'chip', title: '', cardsY: 0, h: 53, clipX: 0, mode: 'none', entry: 0, contentW: w,
      cells: [{ k: 'chip0', kind: 'chip', idx: 0, x: 0, w, h: 53, label, labelFont: fontFor(label) }],
    })
  }
  if (sr.pieces && sr.pieces.collection && d && d.collection) {
    const c = d.collection
    const cta = $L('View Collection')
    const ctaW = textWidth(cta, 20, 'bold')
    const label = $L('Part of {name}').replace('{name}', c.name || '')
    out.push({
      k: 'banner', kind: 'banner', title: '', cardsY: 0, h: 83, clipX: 0, mode: 'none', entry: 0, contentW: 1162,
      cells: [{
        k: 'banner0', kind: 'banner', idx: 0, x: 0, w: 1162, h: 83, data: c, art: c.backdropPath ? seerrApi.getImageUrl(c.backdropPath, 'w780') : '',
        label, labelFont: fontFor(label, 'bold'), cta, ctaX: 1162 - 31 - 24 - ctaW,
      }],
    })
  }
  if (sr.pieces && (sr.pieces.facts || sr.pieces.streaming)) {
    const blocks = []
    const texts = []
    const imgs = []
    const t = (k, x, y, str, size, weight, color, lh = 33) => texts.push({ k, x, y, text: str, size, font: fontFor(str, weight), color, lh })
    let y = 0
    let factsH = 0
    if (sr.pieces.facts) {
      const facts = buildMediaFacts(d, sr.mediaType)
      const lines = []
      for (let i = 0; i < facts.length; i += 3) lines.push(facts.slice(i, i + 3))
      let ly = 15
      lines.forEach((line, li) => {
        if (li) {
          ly += 10
          blocks.push({ k: `rule${li}`, x: 21, y: ly, w: 1100, h: 1, r: 0, color: '#ffffff1a', bw: 0, bc: '#00000000' })
          ly += 11
        }
        line.forEach((f, ci) => {
          const x = 21 + ci * 378
          if (ci) blocks.push({ k: `sep${li}-${ci}`, x: x - 17, y: ly + 18, w: 1, h: 32, r: 0, color: '#ffffff1a', bw: 0, bc: '#00000000' })
          t(`fl${li}-${ci}`, x, ly, f.label, 14, 'medium', '#ffffff99')
          t(`fv${li}-${ci}`, x, ly + 36, f.value, 16, 'bold', '#ffffffff')
        })
        ly += 69
      })
      factsH = ly + 15
      blocks.unshift({ k: 'facts', x: 0, y: 0, w: 1142, h: factsH, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f' })
      y = factsH
    }
    if (sr.pieces.streaming) {
      if (y) y += 36
      const top = y
      t('streamLabel', 21, top + 15, $L('Streaming on'), 14, 'medium', '#ffffff99')
      let px = 21
      let py = top + 15 + 33 + 10
      let rowH = 0
      ;(sr.streamingProviders || []).forEach((p, i) => {
        if (px + 92 > 21 + 1100) {
          px = 21
          py += rowH + 10
          rowH = 0
        }
        imgs.push({ k: `sl${i}`, x: px + 14, y: py, w: 64, h: 64, src: seerrApi.getImageUrl(p.logoPath, 'w92'), r: 12 })
        const names = wrapLines(p.name || '', 14, 'bold', 92)
        names.forEach((n, j) => t(`sn${i}-${j}`, px + (92 - textWidth(n, 14, 'bold')) / 2, py + 70 + j * 16.8, n, 14, 'bold', '#ffffffff', 16.8))
        rowH = Math.max(rowH, 70 + names.length * 16.8)
        px += 92 + 20
      })
      const h = py + rowH + 10 + 15 - top
      blocks.push({ k: 'streaming', x: 0, y: top, w: 1142, h, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f' })
      y = top + h
    }
    // Streaming can't take focus, so it shares the facts row and comes into view with it.
    out.push({
      k: 'facts', kind: 'facts', title: '', cardsY: 0, h: y, clipX: 0, mode: 'none', entry: 0, contentW: 1142, blocks, texts, imgs,
      cells: sr.pieces.facts ? [{ k: 'facts0', kind: 'facts', idx: 0, x: 0, w: 1142, h: factsH }] : [],
    })
  }
  return out
}

// Every row the main screen shows, in order, stacked from `top`.
export const layoutSections = (d, contentW, top) => {
  const it = d.item
  const s = d.settings
  const L = d.lists
  const server = d.server
  const rows = []
  if (d.nextUp.length) rows.push(nextUpRow('nextUp', $L('Next Up'), d.nextUp[0], server, s, contentW, d.anime && d.anime.series))
  if (it.Type === 'Series' && L.seasons.length) rows.push(scrollRowFor('seasons', 'season', $L('Seasons'), seasonCells(L.seasons, server, s, d.seerr), 16))
  if (it.Type === 'Episode' && L.nextEpisode) rows.push(nextUpRow('nextEp', $L('Next Episode'), L.nextEpisode, server, s, contentW, d.anime && d.anime.series))
  if (it.Type === 'Episode' && d.showsSection('moreEpisodes') && L.episodes.length) {
    const title = it.ParentIndexNumber !== undefined ? $L('Season {number} Episodes').replace('{number}', it.ParentIndexNumber) : $L('Episodes')
    const row = scrollRowFor('episodes', 'episode', title, episodeCells(L.episodes, it, server, s, L.episodeRatings, d.anime && d.anime.series), 16)
    // The row opens at the episode on screen, 50px in from the scroller's edge.
    const at = row.cells.findIndex((c) => c.current)
    if (at >= 0) {
      row.entry = at
      row.startScroll = row.cells[at].x + SCROLL_PAD - 50
    }
    rows.push(row)
  }
  if (it.Type === 'BoxSet' && d.collectionItems.length) rows.push(mediaRowFor('items', $L('Items in Collection'), d.collectionItems, s, contentW))
  if (d.bookSeriesItem) rows.push(mediaRowFor('books', $L('Books'), d.bookSeriesItem.Members, s, contentW))
  if (d.showsSection('chapters') && it.Chapters && it.Chapters.length) {
    const entries = it.Chapters.map((ch, i) => {
      const seriesThumb = s.detailUseSeriesThumbnails ? seriesThumbUrl(server, it, CHAPTER_THUMB) : null
      const thumb = seriesThumb || (ch.ImageTag ? getImageUrl(server, it.Id, `Chapter/${i}`, { maxWidth: 400, tag: ch.ImageTag }) : '')
      return { name: ch.Name || '', thumb, time: formatPlaybackDuration(ch.StartPositionTicks / 10000000), ticks: ch.StartPositionTicks, item: null }
    })
    rows.push(scrollRowFor('chapters', 'chapter', $L('Chapters'), thumbCells('ch', 'chapter', entries), 16))
  }
  const { parts, others } = splitAdditionalParts(d.extras)
  if (parts.length) rows.push(scrollRowFor('parts', 'chapter', $L('Additional Parts'), thumbEntries('pt', 'extra', parts, server), 16))
  if (others.length) rows.push(scrollRowFor('extras', 'chapter', $L('Extras'), thumbEntries('ex', 'extra', others, server), 16))
  if (d.cast.length) rows.push(scrollRowFor('cast', 'cast', $L('Cast'), castCells(d.cast, server), 23))
  d.collectionSections.forEach((sec, i) => rows.push(scrollRowFor(`col${i}`, 'media', sec.name, sec.items.map((x, j) => mediaCell(`col${i}-`, x, j, { s })), 24)))
  if (d.similar.length) rows.push(scrollRowFor('similar', 'media', $L('More Like This'), d.similar.map((x, j) => mediaCell('sim', x, j, { s })), 24))
  if (L.reviews && L.reviews.length) rows.push(scrollRowFor('reviews', 'review', $L('Reviews'), reviewCells(L.reviews), 16))
  const sr = d.seerr
  if (sr && sr.pieces) {
    seerrRows(sr).forEach((r) => rows.push(r))
    if (sr.pieces.recommendations) {
      rows.push(scrollRowFor('seerrRecs', 'media', `${sr.displayName} · ${$L('Recommendations')}`, (sr.recommendationCards || []).map((x, j) => mediaCell('sr', x, j, { s })), 24))
    }
    if (sr.pieces.similar) {
      rows.push(scrollRowFor('seerrSim', 'media', `${sr.displayName} · ${$L('Similar')}`, (sr.similarCards || []).map((x, j) => mediaCell('ss', x, j, { s })), 24))
    }
  }
  // The rows start 8px in, 36px apart. A media row that comes first keeps its own 40px.
  let y = top + 8
  rows.forEach((r, i) => {
    if (i) y += 36
    else if (r.marginTop) y += r.marginTop
    r.y = y
    r.clipW = r.clipW || contentW + 40
    y += r.h + (r.marginBottom || 0)
  })
  return { rows, bottom: rows.length ? y : top }
}
