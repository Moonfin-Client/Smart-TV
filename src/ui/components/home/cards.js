// Card models for Home's rows, with their art, badges and text worked out once per row from the
// server items, so the templates only read plain fields.
import $L from '../../../services/i18n.js'
import { getImageUrl, toAbsoluteImageUrl } from '../../../utils/helpers.js'
import { showsWatchedCheck } from '../../../utils/playedState.js'
import { serverCountOf } from '../../../utils/mergedCopies.js'
import { isUnownedSeerrTitle, seerrThumbUrl, seerrWideArtUrl } from '../../../utils/tmdbThumb.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { MEDIA_STATUS } from '../../../utils/seerrStatus.js'
import { mediaStatusLabel } from '../../../utils/seerrBadges.js'
import { normalizeServerUrl } from '../../../utils/serverUrl.js'
import { fontFor, textWidth } from '../../text.js'
import { theme } from '../../theme.js'
import { luminance } from './posterLabels.js'
import { getCardDisplayTitle, getEpisodeLabels, isCarouselRow, isStaticLibraryCard, modernCardMetrics } from './modernCardLayout.js'
import { classicCardSize, classicShape, rowCardType, rowImageType } from './rowPeek.js'
import { episodeArtwork, modernCardImageUrl, requestedArtwork } from './cardArtwork.js'

const formatRuntime = (ticks) => {
  if (!isFinite(ticks) || ticks <= 0) return ''
  const total = Math.round(ticks / 600000000)
  if (total <= 0) return ''
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

const genreNames = (it) => {
  if (Array.isArray(it.Genres) && it.Genres.length) return it.Genres
  if (Array.isArray(it.GenreItems)) return it.GenreItems.map((g) => g && g.Name).filter(Boolean)
  return []
}

// A modern card's year, two genres and runtime line.
const metadataLine = (it) => {
  const parts = []
  if (it.ProductionYear) parts.push(String(it.ProductionYear))
  const genres = genreNames(it).slice(0, 2)
  if (genres.length) parts.push(genres.join(' • '))
  const runtime = formatRuntime(it.RunTimeTicks)
  if (runtime) parts.push(runtime)
  return parts.join(' • ')
}

// What the watched mark, unplayed count and progress bar show under watchedIndicatorBehavior and
// the row's hide switches.
const indicators = (it, s, hideProgress, hideCount) => {
  const ud = it.UserData || {}
  const behavior = s.watchedIndicatorBehavior || 'always'
  const show = behavior === 'always' || behavior === 'hideCount' || (behavior === 'episodesOnly' && it.Type === 'Episode')
  const progress = hideProgress ? 0 : ud.PlayedPercentage || 0
  const unplayed = hideCount ? 0 : ud.UnplayedItemCount
  return {
    progress: show && progress > 0 ? Math.min(100, progress) / 100 : 0,
    played: show && showsWatchedCheck(it),
    count: show && behavior !== 'hideCount' && !ud.Played && unplayed > 0 ? String(unplayed) : '',
    fav: !!ud.IsFavorite,
  }
}

const SEERR_DOTS = {
  [MEDIA_STATUS.AVAILABLE]: 'available',
  [MEDIA_STATUS.PARTIALLY_AVAILABLE]: 'partial',
  [MEDIA_STATUS.PROCESSING]: 'processing',
  [MEDIA_STATUS.PENDING]: 'pending',
}

// The statuses a Seerr banner shows, and their fills.
const BANNER_FILLS = {
  [MEDIA_STATUS.PENDING]: 'pending',
  [MEDIA_STATUS.PROCESSING]: 'requested',
  [MEDIA_STATUS.PARTIALLY_AVAILABLE]: 'available',
  [MEDIA_STATUS.AVAILABLE]: 'available',
}
const seerrBadgeStyle = (s) => (s.showSeerrAvailabilityBadges === false ? null : s.seerrBadgeStyle === 'banner' ? 'banner' : 'badge')
const hexRgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))

// The banner across the top of the art: its word, the theme's status fill, and dark ink on a fill
// as light as Pending's yellow. Modern cards draw a 33px banner, the others a 20px one.
const bannerOf = (status, modern) => {
  const fill = BANNER_FILLS[status]
  if (!fill) return { banner: '' }
  const t = theme()
  const color = t.status[fill]
  const text = mediaStatusLabel(status).toUpperCase()
  const size = modern ? 17 : 10
  return {
    banner: text,
    bannerFill: color,
    bannerInk: luminance(hexRgb(color)) > 0.45 ? '#000000ff' : t.onBadge,
    bannerFont: fontFor(text, 'bold'),
    bannerW: textWidth(text, size, 'bold') + text.length * size * 0.1 + (modern ? 20 : 12),
  }
}

// The top right corner: a server's or source's name, the Seerr marker, the
// Seerr banner along the top, and where the poster labels start. A banner pushes the corner badges
// and the favorite down to 43px on a Modern card and 28px on the others.
const corner = (it, s, showServerBadge, ind, { modern = false, season = null } = {}) => {
  const name = !!((showServerBadge || it._external) && it._serverName && serverCountOf(it) < 2 && !it._mergedType)
  const seerrStyle = seerrBadgeStyle(s)
  const titleStatus = isUnownedSeerrTitle(it) && !it._external && it.mediaInfo ? it.mediaInfo.status : null
  // Only a Classic card shows a season's status.
  const bannerStatus = seerrStyle !== 'banner' ? null : BANNER_FILLS[titleStatus] ? titleStatus : !modern && BANNER_FILLS[season] ? season : null
  const top = bannerStatus ? (modern ? 43 : 28) : 8
  const below = it._external ? 26 : 36
  const moved = name && (ind.played || !!ind.count)
  return {
    serverName: name ? it._serverName : '',
    source: name && !!it._external,
    topY: top,
    // The watched check, the count and the Seerr marker move below a name in that corner.
    cornerY: name ? top + below : top,
    seerrMissing: !!(it._seerr && it._seerrMissing),
    seerrDot: seerrStyle === 'badge' && it._seerr && !it._seerrMissing ? SEERR_DOTS[it.mediaInfo && it.mediaInfo.status] || '' : '',
    labelsTop: ind.fav ? 40 : 8,
    labelsTopRight: (moved ? 8 + below + 32 : ind.played || name ? 40 : 8) + (bannerStatus ? (modern ? 35 : 20) : 0),
    labelsBottom: ind.progress > 0 ? 26 : 8,
    ...bannerOf(bannerStatus, modern),
  }
}

// The server's own movies and episodes get the admin's labels.
// A Seerr or outside title, or one from another server, could be mistaken for one of its own.
export const labelsIdOf = (it, s, serverUrl, on = true) => {
  if (!on || s.showPosterLabels === false || !s.useMoonfinPlugin) return ''
  if (!it.Id || (it.Type !== 'Movie' && it.Type !== 'Episode') || it.LocationType === 'Virtual') return ''
  if ((it._seerr || it._external) && !it._resolvedFromExternal) return ''
  if (normalizeServerUrl(serverUrl) !== getServerUrl()) return ''
  return it.Id
}

const overviewOf = (it) => {
  if (['Movie', 'Series', 'Episode'].indexOf(it.Type) < 0) return ''
  const raw = typeof it.Overview === 'string' ? it.Overview.trim() : ''
  if (it._external && !raw) return ''
  return raw || $L('No description available.')
}

// The server item rides along unenumerated, so the legacy reactivity never walks it when the card
// is handed to a component as a prop.
export const withRaw = (card, it) => Object.defineProperty(card, 'raw', { value: it, enumerable: false, writable: true })

// One card of a Modern or Carousel row.
export const modernCard = (it, i, { s, rowKey, carousel, hideProgress, hideCount, showServerBadge = false, posterLabels = true }) => {
  const serverUrl = it._serverUrl || getServerUrl()
  const isStatic = isStaticLibraryCard(rowKey === 'library-tiles', s)
  const isSquare = it.Type === 'MusicAlbum' || it.Type === 'Audio'
  const isGenre = it.Type === 'Genre' || it.Type === 'MusicGenre'
  const m = modernCardMetrics({ posterSize: s.homeRowsPosterSize, isSquareItem: isSquare, isStatic })
  const seerrWide = isUnownedSeerrTitle(it) ? seerrWideArtUrl(it) || seerrThumbUrl(it) : null
  const opts = { itemServerUrl: serverUrl, isStaticMyMedia: isStatic, useSeriesThumbnails: s.useSeriesThumbnails }
  const rest = modernCardImageUrl(it, false, opts) || ''
  const wide = modernCardImageUrl(it, true, { ...opts, seerrWide }) || ''
  const metadata = [it._calendarDate && it.Subtitle, metadataLine(it)].filter(Boolean).join(' • ')
  const overview = overviewOf(it)
  const expands =
    !isStatic &&
    !isSquare &&
    (!!(metadata || it.CommunityRating || overview) || it.Type === 'Genre' || it.Type === 'CollectionFolder' || !!it.isLibraryTile || it._external === true || it._seerr === true)
  const title = getCardDisplayTitle(it) || ''
  const ind = indicators(it, s, hideProgress, hideCount)
  const ep = getEpisodeLabels(it)
  const restLine = ep ? ep.short : it.Subtitle || ''
  const focusLines = ep ? [ep.full, metadata].filter(Boolean) : metadata || it.Subtitle ? [metadata || it.Subtitle] : []
  return withRaw({
    key: `${it.Id || i}-${i}`,
    idx: i,
    w: m.cardWidth,
    ew: expands ? m.expandedWidth : m.cardWidth,
    h: m.imageHeight,
    rest,
    // A card that doesn't grow shows its focused art in place.
    wide: expands ? wide : wide || rest,
    // A card that grows keeps its poster until the wide art is in.
    waits: expands && !!rest && !!wide && wide !== rest,
    expands,
    genre: isGenre ? (it.Name || '').toUpperCase() : '',
    placeholder: rest ? '' : it.Type === 'Person' ? 'person' : carousel && !isGenre ? 'blank' : 'name',
    name: (it.Name || '').toUpperCase(),
    nameFont: fontFor(it.Name || '', 'bold'),
    title,
    titleFont: fontFor(title, 'bold'),
    restLine,
    restLineFont: fontFor(restLine, 'medium'),
    focusLines,
    overview: carousel ? '' : overview,
    overviewFont: fontFor(overview),
    ...ind,
    ...corner(it, s, showServerBadge, ind, { modern: true }),
    labelsId: labelsIdOf(it, s, serverUrl, posterLabels),
  }, it)
}

// One card of a Classic row, sized by its shape and the row's image type.
export const classicCard = (it, i, { s, cardType, imageType, hideProgress, hideCount, showServerBadge = false, plain = false, seerrSeason = null, posterLabels = true }) => {
  const serverUrl = it._serverUrl || getServerUrl()
  const type = imageType || 'poster'
  const artItem = (it.Type === 'Genre' && it._representative) || it
  const rowArt = requestedArtwork(artItem, type, serverUrl)
  const seerrWide =
    type === 'thumb' && (cardType === 'portrait' || cardType === 'landscape') && isUnownedSeerrTitle(it)
      ? toAbsoluteImageUrl(seerrWideArtUrl(it) || seerrThumbUrl(it), serverUrl)
      : null
  const isBanner = type === 'banner' && cardType !== 'square' && cardType !== 'circle'
  // A Home poster row has no episode poster to show, so it takes the series poster, as Core does.
  // Rows off Home keep the episode still.
  const seriesArt = s.useSeriesThumbnails || (!plain && type === 'poster' && cardType === 'portrait')
  const epArt = it.Type === 'Episode' && !isBanner ? episodeArtwork(it, serverUrl, type, seriesArt) : null
  const wideArt = epArt ? epArt.wide : !!(rowArt || seerrWide)
  const landscape = !isBanner && (cardType === 'landscape' || (cardType === 'portrait' && wideArt))
  const circle = cardType === 'circle'
  const square =
    !isBanner &&
    (circle || cardType === 'square' || (cardType === 'portrait' && !landscape && ['MusicAlbum', 'MusicArtist', 'Audio'].indexOf(it.Type) >= 0))
  const shape = isBanner ? 'banner' : landscape ? 'landscape' : square ? 'square' : 'portrait'
  const size = classicCardSize(shape, s.homeRowsPosterSize)
  const artId = it._imageItemId || it.Id
  const providerIds = it.ProviderIds || {}
  const externalPoster =
    it._externalPosterUrl || providerIds.SeerrPoster || providerIds.SonarrPoster || providerIds.RadarrPoster || providerIds.LidarrPoster || providerIds.ReadarrPoster
  const tags = it.ImageTags || {}
  // A borrowed picture's tags aren't the item's own (cardArtwork.js requestedArtwork).
  const own = artId === it.Id ? tags : {}
  let image = null
  if (it._studioLogoUrl) image = it._studioLogoUrl
  else if (seerrWide) image = seerrWide
  else if (externalPoster && ((it._external && !it._resolvedFromExternal) || !tags.Primary)) image = toAbsoluteImageUrl(externalPoster, serverUrl)
  else if (epArt && epArt.url) image = epArt.url
  else if (rowArt) image = rowArt
  else if (it.Type === 'Genre' && it._representative && it._representative.ImageTags && it._representative.ImageTags.Primary) {
    image = getImageUrl(serverUrl, it._representative.Id, 'Primary', { tag: it._representative.ImageTags.Primary, maxHeight: 300, quality: 80 })
  } else if (landscape && tags.Thumb) image = getImageUrl(serverUrl, artId, 'Thumb', { tag: own.Thumb, maxWidth: 400, quality: 80 })
  else if (landscape && it.ParentThumbItemId) image = getImageUrl(serverUrl, it.ParentThumbItemId, 'Thumb', { tag: it.ParentThumbImageTag, maxWidth: 400, quality: 80 })
  else if (landscape && it.BackdropImageTags && it.BackdropImageTags.length) image = getImageUrl(serverUrl, artId, 'Backdrop', { tag: artId === it.Id ? it.BackdropImageTags[0] : undefined, maxWidth: 400, quality: 80 })
  else if (landscape && it.ParentBackdropItemId) image = getImageUrl(serverUrl, it.ParentBackdropItemId, 'Backdrop', { tag: (it.ParentBackdropImageTags || [])[0], maxWidth: 400, quality: 80 })
  else if (tags.Primary) image = getImageUrl(serverUrl, artId, 'Primary', { tag: own.Primary, maxHeight: 300, quality: 80 })
  else if (it.Type === 'Audio' && it.AlbumId && it.AlbumPrimaryImageTag) image = getImageUrl(serverUrl, it.AlbumId, 'Primary', { tag: it.AlbumPrimaryImageTag, maxHeight: 300, quality: 80 })
  else if (externalPoster) image = toAbsoluteImageUrl(externalPoster, serverUrl)

  const title = it.Type === 'Episode' || it.Type === 'Season' ? it.SeriesName || it.Name || '' : it.Name || ''
  const episodeInfo =
    it.Type === 'Episode' && it.ParentIndexNumber !== undefined
      ? `S${it.ParentIndexNumber}:E${it.IndexNumber} - ${it.Name}`
      : it.Type === 'Season' && it.SeriesName
        ? it.Name
        : ''
  const musicInfo =
    it.Type === 'MusicAlbum'
      ? it.AlbumArtist || (it.AlbumArtists && it.AlbumArtists[0] && it.AlbumArtists[0].Name) || ''
      : it.Type === 'Audio'
        ? it.AlbumArtist || (it.Artists && it.Artists[0]) || ''
        : ''
  // Home's cards give a movie or series its year as the second line. Elsewhere it's the subtitle.
  const year = !plain && (it.Type === 'Movie' || it.Type === 'Series') && it.ProductionYear ? String(it.ProductionYear) : ''
  const second = (it._calendarDate && it.Subtitle) || year || it.Subtitle || ''
  const line1 = isBanner ? [title, episodeInfo || musicInfo || it.Subtitle].filter(Boolean).join('  •  ') : title
  const line2 = isBanner ? '' : episodeInfo || musicInfo || second
  // Off Home a series name heads an episode or season in 600, any other title in 500.
  const strong = !plain || !!episodeInfo
  const ind = indicators(it, s, hideProgress, hideCount)
  return withRaw({
    key: `${it.Id || i}-${i}`,
    idx: i,
    shape,
    circle,
    w: size.width,
    h: size.height,
    image: image || '',
    contain: type === 'logo' || it.Type === 'Studio' || it.Type === 'Network',
    genre: it.Type === 'Genre' || it.Type === 'MusicGenre' ? (it.Name || '').toUpperCase() : '',
    genreSize: Math.min(24, Math.max(14, size.width * (14 / 200))),
    name: (it.Name || '').toUpperCase(),
    nameFont: fontFor(it.Name || '', 'bold'),
    plain: !!plain,
    line1,
    line1Font: fontFor(line1, strong ? 'bold' : 'medium'),
    line2,
    line2Font: fontFor(line2),
    // A season's Seerr marker sits in the top left corner, or with the banner style along the top.
    seerrLeft: seerrBadgeStyle(s) === 'badge' ? SEERR_DOTS[seerrSeason] || '' : '',
    ...ind,
    ...corner(it, s, showServerBadge, ind, { season: seerrSeason }),
    labelsId: labelsIdOf(it, s, serverUrl, posterLabels),
  }, it)
}

// Each card's place along its row at rest, the cards 24px apart.
export const placeCards = (cards, gap = 24) => {
  let x = 0
  cards.forEach((c) => {
    c.x = x
    x += c.w + gap
  })
  return cards
}

// Wide art that has already come in, so a card focused after its art arrived opens straight away.
const ART_MEMORY = 200
const loadedArt = []
const loadedSet = {}
const warming = {}
export const artLoaded = (url) => !!loadedSet[url]
export const noteArt = (url) => {
  if (!url || loadedSet[url]) return
  loadedSet[url] = true
  loadedArt.push(url)
  if (loadedArt.length > ART_MEMORY) delete loadedSet[loadedArt.shift()]
}
// The cards beside the focused one fetch their wide art ahead, so moving along a row opens each one at once.
export const warmArt = (url) => {
  if (!url || loadedSet[url] || warming[url] || typeof Image === 'undefined') return
  warming[url] = true
  const img = new Image()
  img.onload = () => {
    delete warming[url]
    noteArt(url)
  }
  img.onerror = () => delete warming[url]
  img.src = url
}

// The cards a row draws in the current look, and the See All card a library's row ends in.
export const shapeRow = (row, look, s) => {
  // Every row but Seerr's, the online recommendations and Genres gets the poster labels.
  const posterLabels = !row.isSeerrRow && !row.isOnlineRecoRow && !row.isGenreRow
  const opts = { s, rowKey: row.key, hideProgress: look.hideProgress, hideCount: look.hideCount, plain: !!look.plain, posterLabels }
  const type = rowCardType(row, s)
  const cardType = type === 'poster' ? 'portrait' : type
  let cards
  let seeAll = null
  // A library's, a collection's or a calendar's row ends in a See All card.
  const seesAll = !!((row.isLatestRow && row.library) || row.collection || row.seeAllCalendar)
  if (look.style === 'classic' || row.forceClassic) {
    // Rows off Home keep poster art.
    const imageType = look.plain ? 'poster' : rowImageType(row, s)
    cards = row.items.map((it, i) => classicCard(it, i, { ...opts, cardType, imageType }))
    if (seesAll) {
      const size = classicCardSize(classicShape(cardType, imageType), s.homeRowsPosterSize)
      seeAll = { w: size.width, h: size.height }
    }
  } else {
    // My Media, music and the Live TV tiles keep plain Modern cards in a Carousel look.
    const carousel = look.style === 'carousel' && isCarouselRow(row, s) && !row.isTileRow
    cards = row.items.map((it, i) => modernCard(it, i, { ...opts, carousel }))
    if (seesAll) {
      const m = modernCardMetrics({ posterSize: s.homeRowsPosterSize })
      seeAll = { w: m.cardWidth, h: m.imageHeight }
    }
  }
  placeCards(cards)
  const last = cards[cards.length - 1]
  if (seeAll && last) {
    seeAll.x = last.x + last.w + 24
    seeAll.icon = row.seeAllCalendar && !row.collection && !row.library ? 'icons/home_calendar_month.webp' : 'icons/home_grid_view_rounded.webp'
  }
  return { ...row, cards, seeAll: seeAll && last ? seeAll : null }
}
