// Nouveau's sections, laid out down the page: which ones show (nouveauSectionOrder), the rails in
// each with their cards sized by nouveauMetrics, and the focus chain that walks them. Positions are
// page coordinates, and a rail's cards are placed along its own track.
import $L from '../../../services/i18n.js'
import { fontFor } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { getImageUrl } from '../../../utils/helpers.js'
import { reviewInitial, reviewMeta, reviewPreview } from '../../../utils/tmdbReviews.js'
import { castPhotoUrl, seriesThumbUrl } from '../detailsMedia.js'
import { splitAdditionalParts } from '../extraCategories.js'
import { spotlightItemImageUrl } from '../spotlight/spotlightImages'
import { nouveauCardImageUrl } from './nouveauCardImage'
import { buildDiscoveryRails } from './nouveauDiscovery'
import { chapterDisplayName, collectionSubtitle, extraSubtitle } from './nouveauLabels'
import { sortLabel } from './nouveauCollectionSort'
import { buildNouveauChain } from './nouveauFocusChain'
import {
  RAIL_GAP, TV_RAIL_GAP, collectionCardHeight, collectionCardWidth, discoveryCardWidth, discoveryPosterHeight, episodeCardWidth,
  episodeImageHeight, mediaRailArtworkHeight, mediaRailCardWidth, peopleAvatarSize, peopleCardWidth,
} from './nouveauMetrics'
import {
  SECTION_BOOKS, SECTION_CHAPTERS, SECTION_COLLECTION, SECTION_DETAILS, SECTION_DISCOVERY, SECTION_EPISODES, SECTION_EXTRAS, SECTION_PARENT_COLLECTIONS,
  SECTION_PARTS, SECTION_PEOPLE, SECTION_REVIEWS, nouveauSectionOrder, seerrDiscoveryExpected,
} from './nouveauSections'

const TITLE_H = 33 + 20
const CLEARANCE = 20
const LANDSCAPE_DETAILS = 1 + 14 + 20.7 + 16 + 1

// One card's look and size. `w` and `h` are the card's outer box, border included.
const posterCard = (entry, i, w, artH, image, title, subtitle) => ({
  k: `p${i}-${entry.cardKey || entry.Id || i}`, idx: i, kind: 'poster', item: entry, w: w + 2, artW: w, artH, image: image || '',
  title: title || '', subtitle: subtitle || '', titleFont: fontFor(title || '', 'bold'), subtitleFont: fontFor(subtitle || ''),
  h: artH + 2 + (title || subtitle ? 10 + (title ? 33 : 0) + (subtitle ? 33 : 0) : 0),
  progress: progressOf(entry), subtitleY: artH + 1 + 10 + (title ? 33 : 0),
})

const stillCard = (key, i, w, artH, image, title, subtitle, placeholder, extra) => ({
  k: `s${i}-${key}`, idx: i, kind: 'still', w: w + 2, artW: w, artH, image: image || '', title: title || '', subtitle: subtitle || '',
  titleFont: fontFor(title || '', 'bold'), subtitleFont: fontFor(subtitle || ''), placeholder: placeholder ? String(placeholder).toUpperCase() : '',
  placeholderFont: fontFor(String(placeholder || ''), 'bold'),
  h: artH + 2 + 10 + (title ? 33 : 0) + (subtitle ? 33 : 0), progress: 0, subtitleY: artH + 1 + 10 + (title ? 33 : 0), ...extra,
})

// The summary keeps the two lines it wraps to in its fixed box and clips the rest, with no ellipsis.
const landscapeCard = (entry, i, w, artH, image, nextUpId) => {
  const overview = entry.Overview ? wrapLines(entry.Overview.replace(/\s+/g, ' '), 15, 'regular', w - 34).slice(0, 2).join('\n') : ''
  return {
    k: `l${i}-${entry.Id}`, idx: i, kind: 'landscape', item: entry, w, artW: w, artH, image: image || '', title: entry.Name || '',
    titleFont: fontFor(entry.Name || '', 'bold'), overview, overviewFont: fontFor(overview), nextUp: Boolean(nextUpId) && entry.Id === nextUpId,
    nextUpLabel: $L('Up Next'), nextUpW: textWidth($L('Up Next'), 13, 'bold') + 20,
    progress: progressOf(entry), detailsY: artH + 2 + 10, detailsH: LANDSCAPE_DETAILS + (overview ? 7 + 40.5 : 0),
    h: artH + 2 + 10 + LANDSCAPE_DETAILS + (overview ? 7 + 40.5 : 0),
  }
}

// A name or role wraps at the card's width and shows its first line, clipped at 2.6em, which leaves
// a wrapped one 41.6px (a name) or 36.4px (a role) tall rather than 33.
const personCard = (person, i, w, avatar, server) => {
  const role = String(person.Role || '').split('\n').filter(Boolean).join(', ')
  const name = person.Name || ''
  const names = wrapLines(name, 16, 'bold', w)
  const roles = wrapLines(role, 14, 'regular', w)
  const nameH = name ? (names.length > 1 ? 41.6 : 33) : 0
  const roleH = role ? (roles.length > 1 ? 36.4 : 33) : 0
  const nameY = avatar + 2 + 16
  return {
    k: `c${i}-${person.Id || person.Name}`, idx: i, kind: 'person', item: person, w, avatar, avatarX: (w - avatar - 2) / 2,
    image: castPhotoUrl(person, server, 360) || '', name: names[0] || '', nameFont: fontFor(name, 'bold'), role: roles[0] || '', roleFont: fontFor(role),
    nameY, roleY: (name ? nameY + nameH : avatar + 2) + 6, h: avatar + 2 + (name ? 16 + nameH : 0) + (role ? 6 + roleH : 0),
  }
}

const reviewCard = (r, i) => {
  const preview = reviewPreview(r.content)
  return {
    k: `r${i}-${r.id}`, idx: i, kind: 'review', w: 520, h: 250, review: r, author: r.author || '', authorFont: fontFor(r.author || '', 'bold'),
    meta: reviewMeta(r), initial: reviewInitial(r.author), avatar: r.avatarUrl || '', preview, previewFont: fontFor(preview),
  }
}

// Only part way through counts, so a finished title isn't left wearing a full bar.
function progressOf(entry) {
  const p = ((entry.UserData && entry.UserData.PlayedPercentage) || 0) / 100
  return p > 0 && p < 1 ? p : 0
}

// A rail of cards: its heading, then a track 20px clear above and below the tallest card. An
// episode's artwork runs 2px past its card (its border), which the track scrolls to as well.
const rail = (id, title, cards, gap, extra) => {
  if (!cards.length) return null
  let x = 0
  cards.forEach((c) => {
    c.x = x
    x += c.w + gap
  })
  const cardH = Math.max(...cards.map((c) => c.h))
  const trackY = title ? TITLE_H : 0
  return {
    k: `rail:${id}`, id, node: `rail:${id}`, title: title || '', titleFont: fontFor(title || '', 'bold'), cards, gap, trackY,
    trackH: CLEARANCE * 2 + cardH, h: trackY + CLEARANCE * 2 + cardH, total: x - gap + (cards[0].kind === 'landscape' ? 2 : 0), menu: false, nearEnd: '', startIndex: 0, ...extra,
  }
}

// Everything below the hero. `d` carries the page's lists and settings, and `top` is where the hero
// ends. Returns the sections in order with their rails at page positions, the season selector and
// playlist header where there's one, the focus chain, and where the footer starts.
export const layoutSections = (d, geo, top) => {
  const it = d.item
  const t = it.Type
  const s = d.settings
  const server = d.server
  const isPerson = t === 'Person'
  const isSeries = t === 'Series'
  const vp = geo.viewport
  const chapters = d.showsSection('chapters') ? it.Chapters || [] : []
  const { parts, others } = splitAdditionalParts(d.extras)
  const seerr = d.seerr || {}
  const discovery = buildDiscoveryRails({
    item: it, similar: d.similar, seerrSimilar: seerr.similarCards || [], seerrRecommendations: seerr.recommendationCards || [], hasSeerr: Boolean(seerr.isActive),
  })

  const sections = isPerson
    ? d.personRails.map((r) => r.id).concat(SECTION_DETAILS)
    : nouveauSectionOrder({
      type: t, chapterCount: chapters.length, partCount: parts.length, extraCount: others.length, actorCount: d.cast.length, directorCount: d.crew.length,
      similarLoaded: d.similarLoaded, similarCount: d.similar.length, reviewCount: d.reviews.length, parentCollectionCount: d.collectionSections.length,
      seerrExpected: (d.showsSection('seerrSimilar') || d.showsSection('seerrRecommendations')) && seerrDiscoveryExpected({
        type: t, seerrAvailable: Boolean(seerr.isActive || (d.actionInput && d.actionInput.seerrOnly)), tmdbId: it.ProviderIds && it.ProviderIds.Tmdb, imdbId: it.ProviderIds && it.ProviderIds.Imdb,
      }),
      seerrResolved: seerr.loading !== true, seerrSimilarCount: (seerr.similarCards || []).length,
      seerrRecommendationCount: (seerr.recommendationCards || []).length, isBookSeries: Boolean(d.bookSeriesItem),
    })

  const posterW = discoveryCardWidth(vp)
  const posterH = discoveryPosterHeight(posterW)
  const collectionW = collectionCardWidth(vp)
  const collectionH = collectionCardHeight(collectionW)
  const episodeW = episodeCardWidth(vp)
  const episodeH = episodeImageHeight(episodeW)
  const stillW = mediaRailCardWidth(vp)
  const stillH = mediaRailArtworkHeight(stillW)
  const personW = peopleCardWidth(vp)
  const personAvatar = peopleAvatarSize(personW)

  const posters = (list) => list.map((e, i) => posterCard(e, i, posterW, posterH, spotlightItemImageUrl(server, e), e.Name,
    e.Subtitle || (e.ProductionYear ? String(e.ProductionYear) : null)))
  const collectionCards = (list) => list.map((e, i) => posterCard(e, i, collectionW, collectionH, spotlightItemImageUrl(server, e), e.Name, collectionSubtitle(e)))
  const landscapes = (list) => list.map((e, i) => landscapeCard(e, i, episodeW, episodeH, nouveauCardImageUrl(server, e, { fallbackUrl: d.backdropUrl }), d.nextUpId))

  const out = { sections: [], rails: [], seasonBar: null, playlistHeader: null, footerY: 0 }
  let y = top
  sections.forEach((id) => {
    y += id === SECTION_DETAILS ? 80 : 64
    const sectionTop = y
    const add = (r) => {
      if (!r) return
      r.y = y
      r.sectionTop = sectionTop
      out.rails.push(r)
      y += r.h
    }
    if (id === SECTION_DETAILS) {
      out.footerY = y
      out.sections.push({ id, y: sectionTop })
      return
    }
    if (id === SECTION_CHAPTERS) {
      const thumbs = s.detailUseSeriesThumbnails ? seriesThumbUrl(server, it, { maxWidth: 400, quality: 90 }) : null
      add(rail(id, $L('Chapters'), chapters.map((ch, i) => {
        const name = chapterDisplayName(ch.Name, ch.StartPositionTicks)
        const image = thumbs || (ch.ImageTag ? getImageUrl(server, it.Id, `Chapter/${i}`, { maxWidth: 400, quality: 90, tag: ch.ImageTag }) : null)
        return stillCard(i, i, stillW, stillH, image, name, '', ch.Name || name, { ticks: ch.StartPositionTicks })
      }), RAIL_GAP))
    } else if (id === SECTION_PARTS || id === SECTION_EXTRAS) {
      const list = id === SECTION_PARTS ? parts : others
      add(rail(id, id === SECTION_PARTS ? $L('Additional Parts') : $L('Extras'), list.map((x, i) =>
        stillCard(x.Id, i, stillW, stillH, nouveauCardImageUrl(server, x, { fallbackUrl: d.backdropUrl }), x.Name, extraSubtitle(x), x.Name, { item: x })), RAIL_GAP))
    } else if (id === SECTION_PARENT_COLLECTIONS) {
      d.collectionSections.forEach((sec, i) => add(rail(`${id}-${i}`, sec.name, collectionCards(sec.items), TV_RAIL_GAP)))
    } else if (id === SECTION_COLLECTION) {
      add(rail(id, $L('Collection'), collectionCards(d.collectionItems), TV_RAIL_GAP, { menu: true, nearEnd: 'titles', collection: true }))
      if (d.playlistItems.length) {
        const label = sortLabel(d.collectionSort)
        out.playlistHeader = { y, title: $L('Playlist'), label, labelFont: fontFor(label, 'bold') }
        y += 51 + 20
        add(rail(`${id}-playlist`, '', landscapes(d.playlistItems), TV_RAIL_GAP, { menu: true, nearEnd: 'items', collection: true, playsArtwork: true }))
      }
    } else if (id === SECTION_EPISODES) {
      if (isSeries && d.seasonTabs.length > 1) {
        out.seasonBar = { y, tabs: d.seasonTabs, active: String(d.activeSeason) }
        y += 63
      }
      add(rail(id, isSeries ? '' : $L('Episodes'), landscapes(d.seasonEpisodes), TV_RAIL_GAP, { menu: true, playsArtwork: true }))
    } else if (id === SECTION_DISCOVERY) {
      add(rail(`${id}-similar`, $L('Similar'), posters(discovery.related), RAIL_GAP, { menu: true }))
      add(rail(`${id}-recommendations`, $L('Recommendations'), posters(discovery.recommendations), RAIL_GAP))
    } else if (id === SECTION_REVIEWS) {
      add(rail(id, $L('Reviews'), d.reviews.map(reviewCard), RAIL_GAP))
    } else if (id === SECTION_BOOKS) {
      add(rail(id, $L('Books'), d.bookSeriesItem.Members.map((b, i) => stillCard(b.Id, i, posterW, posterH, nouveauCardImageUrl(server, b, { fallbackUrl: d.backdropUrl }), b.Name, '', b.Name, { item: b, book: true })), RAIL_GAP))
    } else if (id === SECTION_PEOPLE) {
      const title = d.cast.length && d.crew.length ? $L('Cast & Crew') : d.cast.length ? $L('Cast') : $L('Crew')
      add(rail(id, title, d.cast.concat(d.crew).map((p, i) => personCard(p, i, personW, personAvatar, server)), TV_RAIL_GAP))
    } else {
      const pr = d.personRails.find((r) => r.id === id)
      if (pr) add(rail(id, pr.title, posters(pr.items), RAIL_GAP, { menu: true }))
    }
    out.sections.push({ id, y: sectionTop })
  })
  out.bottom = y
  out.hasFooter = sections.indexOf(SECTION_DETAILS) >= 0
  out.chain = buildNouveauChain({
    hasOverview: d.hasOverview, hasSeasonSelector: isSeries && d.seasonTabs.length > 1,
    rails: out.rails.map((r) => r.id), footerRows: out.hasFooter ? 1 : 0,
  })
  return out
}
