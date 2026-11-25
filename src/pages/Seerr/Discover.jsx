import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import Spinner from '../../ui/components/Spinner.jsx'
import SeerrPill, { pillWidth } from '../../ui/components/seerr/SeerrPill.jsx'
import SeerrMediaRow, { CORE_GAP } from '../../ui/components/seerr/SeerrMediaRow.jsx'
import DiscoverRow from './DiscoverRow.jsx'
import { posterMarks, textWidth } from '../../ui/components/seerr/look.js'
import { modernCard } from '../../ui/components/home/cards.js'
import { modernCardMetrics, posterSizeScale, homeRowSpacing } from '../../ui/components/home/modernCardLayout.js'
import { cssStops } from '../../ui/components/account/gradient.js'
import { keyed } from '../../ui/components/library/pageKit.js'
import { fontFor, uiFont, cssShift } from '../../ui/text.js'
import { theme, navOnLeft } from '../../ui/theme.js'
import { tier } from '../../ui/tier.js'
import { focusNav } from '../../app/focus.js'
import { router } from '../../app/router.js'
import { getStore } from '../../state/store.js'
import { getPlatform } from '../../platform.js'
import { isMdblistEnabled } from '../../services/mdblistApi.js'
import * as seerrApi from '../../services/seerrApi.js'
import hydrateRequestMediaItems, { hydrateRecentlyAddedItems, hydrateWatchlistItems } from '../../utils/seerrHydration.js'
import { seerrGenreBackdrop } from '../../utils/seerrGenreArt.js'
import { shuffled } from '../../utils/shuffled.js'
import {
  STREAMING_NETWORKS, MOVIE_STUDIOS, pickShortcutBackdrops, normalizeMediaItem, seerrBrowseTitle, seerrShortcuts,
} from '../../utils/seerrHomeRows.js'
import { isSupportedSlider, loadDiscoverSliders, loadSliderPage } from '../../utils/seerrSliders.js'
import * as settings from '../../state/settings.js'
import { checkSeerr, seerrState } from '../../state/seerr.js'
import { filterDiscoverItems, openSeerrItem, openSeerrShortcut, posterModel, seerrYear } from './seerrModels.js'

// The discover rows under a scrim, with the Search and Requests pills at the top right. The tile
// rows (shortcuts, genres, studios, networks) are DiscoverRow, and the title rows follow the Home
// rows style: Modern rows, or Classic posters with the info panel above them. Admin sliders come
// after the screen's own rows.
const LOCAL_ROW_LIMIT = 15

const buildRowConfigs = () => [
  { id: 'shortcuts', title: seerrBrowseTitle(), type: 'shortcut' },
  { id: 'recentRequests', title: $L('Recent Requests'), type: 'media' },
  { id: 'yourWatchlist', title: $L('Your Watchlist'), type: 'media', fetchFn: 'watchlist' },
  { id: 'recentlyAdded', title: $L('Recently Added'), type: 'media' },
  { id: 'trending', title: $L('Trending'), type: 'media', fetchFn: 'trending' },
  { id: 'popularMovies', title: $L('Popular Movies'), type: 'media', fetchFn: 'trendingMovies' },
  { id: 'genreMovies', title: $L('Movie Genres'), type: 'genre', mediaType: 'movie' },
  { id: 'upcomingMovies', title: $L('Upcoming Movies'), type: 'media', fetchFn: 'upcomingMovies' },
  { id: 'studios', title: $L('Studios'), type: 'studio' },
  { id: 'popularTv', title: $L('Popular Series'), type: 'media', fetchFn: 'trendingTv' },
  { id: 'genreTv', title: $L('Series Genres'), type: 'genre', mediaType: 'tv' },
  { id: 'upcomingTv', title: $L('Upcoming Series'), type: 'media', fetchFn: 'upcomingTv' },
  { id: 'networks', title: $L('Networks'), type: 'network' },
]

// Where the pills and the rows sit at 1920. The left rail moves everything in and lets the rows
// start higher.
const TOP_NAV_LAYOUT = { pillsTop: 139, rowsTop: 212, inset: 134, infoLeft: 107 }
const SIDEBAR_LAYOUT = { pillsTop: 47, rowsTop: 120, inset: 147, infoLeft: 160 }

// Posters are Home's own size. Tiles are 180 by 90 points at Medium on an 1150 point canvas and
// grow with the poster size. A Classic row leaves room for a focused poster's growth.
const DP = 1920 / 1150
const discoverSizes = (posterSize, zoom) => {
  const { imageHeight, cardWidth } = modernCardMetrics({ posterSize })
  const scale = posterSizeScale(posterSize)
  const growth = zoom ? Math.round(imageHeight * 0.12) : 0
  return {
    posterWidth: cardWidth,
    posterHeight: imageHeight,
    posterGap: zoom ? Math.round((12 + (cardWidth / DP) * 0.06) * DP) : Math.round(12 * DP),
    rowTop: Math.round(5 * DP) + 2 + growth,
    rowHeight: Math.round(imageHeight + 75 * DP + growth),
    tileWidth: 2 * Math.round(90 * DP * scale),
    tileHeight: Math.round(90 * DP * scale),
    logoInset: Math.round(16 * DP * scale),
  }
}

const SHORTCUT_ICONS = { movies: 'movie', series: 'tv', issues: 'report_problem_outlined', requests: 'playlistAddCheck' }

// A request becomes a title card. The id stays per request, since a title asked for twice keeps a
// card for each.
const requestToItem = (request) => {
  const media = request.media || {}
  return {
    id: media.tmdbId != null ? media.tmdbId : media.id,
    mediaType: request.type || media.mediaType,
    title: media.title || media.name,
    name: media.name || media.title,
    overview: media.overview,
    releaseDate: media.releaseDate,
    firstAirDate: media.firstAirDate,
    posterPath: media.posterPath,
    backdropPath: media.backdropPath,
    voteAverage: media.voteAverage,
    mediaInfo: media,
    _requestId: request.id,
  }
}

const fetchPage = (config, page) => {
  switch (config.fetchFn) {
    case 'trending': return seerrApi.trending(page)
    case 'trendingMovies': return seerrApi.trendingMovies(page)
    case 'trendingTv': return seerrApi.trendingTv(page)
    case 'upcomingMovies': return seerrApi.upcomingMovies(page)
    case 'upcomingTv': return seerrApi.upcomingTv(page)
    case 'watchlist': return seerrApi.getWatchlist(page)
    case 'slider': return loadSliderPage(config.slider, page)
    default: return Promise.resolve(null)
  }
}

// The watchlist comes back bare and is filled in from each title's details.
const pageItems = (config, results = []) =>
  config.fetchFn === 'watchlist' ? hydrateWatchlistItems(results) : Promise.resolve(filterDiscoverItems(results))

const withHidden = (card, name, value) => Object.defineProperty(card, name, { value, enumerable: false, writable: true })

// A Modern row's card, with Home's card model for the art and the overview.
const coreCard = (item, i, s, sizes) => {
  const normalized = normalizeMediaItem(item)
  if (item._requestId != null) normalized.Id = `seerr-request-${item._requestId}`
  const m = modernCard(normalized, i, { s, rowKey: 'discover' })
  const title = normalized.Name || ''
  const sub = (m.focusLines && m.focusLines[0]) || ''
  const card = {
    key: item._requestId != null ? `request-${item._requestId}` : `${normalized._seerrMediaType}-${item.id}`,
    idx: i,
    x: i * (sizes.posterWidth + CORE_GAP),
    title,
    titleFont: fontFor(title, 'bold'),
    subtitle: sub,
    subtitleFont: fontFor(sub),
    initial: title.charAt(0),
    image: m.rest,
    wide: m.wide,
    overview: m.overview,
    overviewFont: m.overviewFont,
    marks: posterMarks(normalized._seerrMediaType, item.mediaInfo && item.mediaInfo.status, sizes.posterWidth, s),
  }
  withHidden(card, 'raw', normalized)
  return withHidden(card, 'item', item)
}

const classicCard = (item, i, sizes) => {
  const card = posterModel(item, i, { subtitle: seerrYear(item), artW: sizes.posterWidth })
  if (item._requestId != null) card.key = `request-${item._requestId}`
  card.x = i * (sizes.posterWidth + sizes.posterGap)
  return withHidden(card, 'item', item)
}

const tileCards = (config, items, sizes) => {
  const step = sizes.tileWidth + 20
  return items.map((it, i) => {
    const base = { idx: i, x: i * step }
    if (config.type === 'shortcut') {
      return {
        ...base,
        key: it.key,
        kind: 'shortcut',
        art: it.backdrop ? seerrApi.getImageUrl(it.backdrop, 'w780') : '',
        icon: SHORTCUT_ICONS[it.key] || 'playlistAddCheck',
        name: it.name,
        nameFont: uiFont('bold'),
        shortcut: it.key,
      }
    }
    if (config.type === 'genre') {
      const art = seerrGenreBackdrop(it.id, it.backdrops)
      const name = String(it.name || '').toUpperCase()
      const room = sizes.tileWidth - 40
      const natural = textWidth(name, 23, 'bold') + 4.2 * name.length
      return {
        ...base,
        key: `g${it.id}`,
        kind: 'genre',
        art: art ? seerrApi.getImageUrl(art.path, art.size) : '',
        name,
        nameFont: fontFor(name, 'bold'),
        // A name too long for the tile shrinks to fit on one line.
        nameScale: natural > room ? room / natural : 1,
        genreId: it.id,
        genreName: it.name,
      }
    }
    return {
      ...base,
      key: `l${it.id}`,
      kind: 'logo',
      logo: seerrApi.getImageUrl('/' + it.logo, 'w780_filter(duotone,ffffff,bababa)'),
      inset: sizes.logoInset,
      entryId: it.id,
      entryName: it.name,
    }
  })
}

// The discover scrim, dark at the top, clearing a quarter of the way down, dark again from six
// tenths. It's laid on the backdrop and the page fill themselves.
const SCRIM = { angle: Math.PI * 2, ...cssStops([0x000000cc, 0x00000054, 0x000000de, 0x000000de], [0, 0.25, 0.6, 1]) }
const COVER = { resizeMode: { type: 'cover' } }

// The pill count stays for a minute across visits, so coming back doesn't refetch it.
let cachedBadge = { count: 0, at: 0 }
const BADGE_TTL_MS = 60000

export default function Discover(props) {
  const store = getStore()
  const [data, setData] = createSignal({})
  const [loadingRows, setLoadingRows] = createSignal({})
  const [sliderConfigs, setSliderConfigs] = createSignal([])
  const [loading, setLoading] = createSignal(true)
  const [enabled, setEnabled] = createSignal(true)
  const [authenticated, setAuthenticated] = createSignal(true)
  const [zone, setZone] = createSignal('rows')
  const [pillCur, setPillCur] = createSignal(0)
  const [rowIndex, setRowIndex] = createSignal(0)
  const [grows, setGrows] = createSignal({})
  const [backdrop, setBackdrop] = createSignal('')
  const [focusedItem, setFocusedItem] = createSignal(null)
  const [badge, setBadge] = createSignal(cachedBadge.count)
  const noticeFont = uiFont()
  const infoFont = uiFont()
  const my = { pages: {}, more: {}, curs: {}, backdropTimer: null, alive: true }
  const rowNodes = {}
  let root
  onCleanup(() => {
    my.alive = false
    clearTimeout(my.backdropTimer)
  })

  const s = () => settings.all()
  const t = () => theme()
  const sidebar = () => navOnLeft()
  const layout = () => (sidebar() ? SIDEBAR_LAYOUT : TOP_NAV_LAYOUT)
  const modern = () => s().homeRowsStyle !== 'v1'
  const sizes = createMemo(() => discoverSizes(s().homeRowsPosterSize, s().cardFocusZoom !== false))
  // Rows are spaced the way Home spaces its own. Tile rows keep Classic padding in Modern, and
  // Expanded Rows keeps the margin Home gives a row.
  const spacing = createMemo(() => {
    const st = s()
    const expanded = st.fullScreenRows === true
    const classic = homeRowSpacing({ ...st, homeRowsStyle: 'v1' })
    return {
      media: expanded ? (modern() ? 26 : 30) : modern() ? homeRowSpacing(st) || 0 : classic,
      tile: expanded ? (modern() ? 26 : 30) : classic,
    }
  })
  const coreLook = createMemo(() => {
    const platform = getPlatform()
    const st = s()
    const m = modernCardMetrics({ posterSize: st.homeRowsPosterSize })
    return {
      inset: layout().inset,
      titleSize: platform === 'webos' ? 29 : platform === 'tizen' ? 26 : 28,
      itemsBottom: platform === 'tizen' ? 20 : 24,
      // The lower tiers open the card at once.
      openMs: tier.legacy ? 0 : { extraSlow: 450, slow: 300, medium: 180, fast: 90 }[st.modernCardTransitionSpeed] || 0,
      focus: t().focus,
      leftNav: sidebar(),
      posterW: m.cardWidth,
      posterH: m.imageHeight,
      openW: m.expandedWidth,
      mdb: isMdblistEnabled(st),
    }
  })
  const tileLook = createMemo(() => ({ inset: layout().inset, sizes: sizes(), leftNav: sidebar(), focus: t().focus, zoom: s().cardFocusZoom !== false }))
  const rowConfigs = createMemo(() => buildRowConfigs().concat(sliderConfigs()))
  // Each config's cards, built again only when its items or the look change, never on a focus move.
  const built = {}
  const cardsFor = (config, items, kind) => {
    const sig = `${kind}|${JSON.stringify(sizes())}|${modern()}`
    const was = built[config.id]
    if (was && was.items === items && was.sig === sig) return was.cards
    const st = s()
    const cards = kind === 'modern' ? items.map((it, n) => coreCard(it, n, st, sizes()))
      : kind === 'poster' ? items.map((it, n) => classicCard(it, n, sizes()))
      : tileCards(config, items, sizes())
    built[config.id] = { items, sig, cards }
    return cards
  }
  const rows = createMemo(() => {
    const out = []
    const d = data()
    const sz = sizes()
    rowConfigs().forEach((config) => {
      const items = d[config.id]
      if (!items || !items.length) return
      const kind = config.type !== 'media' ? 'tile' : modern() ? 'modern' : 'poster'
      const row = { key: config.id, i: out.length, kind, title: config.title, configId: config.id, cards: cardsFor(config, items, kind) }
      if (kind === 'modern') {
        row.h = 40 + 10 + sz.posterHeight + 89 + coreLook().itemsBottom
        row.gap = spacing().media
      } else if (kind === 'poster') {
        row.h = 49 + sz.rowHeight
        row.gap = spacing().media
      } else {
        row.h = 49 + sz.tileHeight + 17
        row.gap = spacing().tile
      }
      out.push(row)
    })
    return out
  })
  // Each row's top down the list, with the room an open Modern card's text takes.
  const ys = createMemo(() => {
    let y = 0
    const g = grows()
    return rows().map((r) => {
      const at = y
      y += r.h + (g[r.key] || 0) + r.gap
      return at
    })
  })
  // The Classic info panel holds a fixed 200px until a poster is focused.
  const listTop = () => {
    if (modern()) return layout().rowsTop
    return focusedItem() ? layout().pillsTop + 53 + 3 + 33 + 7 + 98 + 3 : 200
  }
  const listH = () => {
    const r = rows()
    const n = r.length
    if (!n) return 0
    const last = r[n - 1]
    return ys()[n - 1] + last.h + (grows()[last.key] || 0) + last.gap + 53
  }
  // The focused row's top lines up with the top of the list, and the first row sends the list
  // back to the start. Only the list scrolls, so nothing above it moves.
  const listScroll = () => {
    if (!rows()[rowIndex()] || rowIndex() === 0) return 0
    return Math.max(0, Math.min(ys()[rowIndex()], listH() - (1080 - listTop())))
  }
  // Only the rows near the screen are built, and each keeps its card when it comes back.
  const shownRows = createMemo(() => {
    if (loading()) return []
    const top = listScroll() - 1080
    const bottom = listScroll() + 2160
    return rows().filter((r) => ys()[r.i] + r.h > top && ys()[r.i] < bottom)
  })
  const list = keyed(shownRows, (r) => `${r.kind}|${r.key}`)
  const pills = createMemo(() => {
    const labels = [
      { id: 'search', label: $L('Search'), icon: 'search', badge: 0 },
      { id: 'requests', label: $L('Requests'), icon: 'moveToInboxOutlined', badge: badge() },
    ]
    let right = 1920 - 40
    const placed = []
    for (let i = labels.length - 1; i >= 0; i--) {
      const w = pillWidth(labels[i].label, labels[i].badge)
      right -= w
      placed.unshift({ ...labels[i], x: right, i })
      right -= 17
    }
    return placed
  })
  const showPills = () => !loading() && enabled() && authenticated()
  const notice = () => {
    if (!enabled()) return { a: $L('Seerr is not enabled.'), b: $L('Go to Settings to configure Seerr.') }
    if (!authenticated()) return { a: $L('Seerr is not authenticated.'), b: $L('Go to Settings to log in to Seerr.') }
    return null
  }
  const backdropSrc = () => (s().showHomeBackdrop !== false ? backdrop() : '')
  // The Classic info panel for the focused title, in 24, 14 and 12 point type.
  const info = createMemo(() => {
    const item = focusedItem()
    if (modern() || !item || !(item.title || item.name)) return null
    const title = item.title || item.name
    const rating = item.vote_average != null ? item.vote_average : item.voteAverage
    const type = item.media_type || item.mediaType
    const year = seerrYear(item)
    const meta = []
    let x = 0
    let star = -1
    if (year) {
      meta.push({ k: 'y', text: year, x, color: '#ffffffb3' })
      x += textWidth(year, 23) + 20
    }
    if (rating > 0) {
      const text = rating.toFixed(1)
      star = x
      meta.push({ k: 'r', text, x: x + 34, color: '#ffffffb3' })
      x += 34 + textWidth(text, 23) + 20
    }
    meta.push({ k: 't', text: type === 'tv' ? $L('Series') : $L('Movie'), x, color: '#ffffff8a' })
    return { title, titleFont: fontFor(title, 'bold'), overview: item.overview || '', overviewFont: fontFor(item.overview || ''), meta, star }
  })

  const loadBadge = async (userRead) => {
    if (Date.now() - cachedBadge.at < BADGE_TTL_MS) return setBadge(cachedBadge.count)
    const u = await userRead
    const perms = u && u.permissions
    let count = 0
    if (seerrApi.canManageRequests(perms)) count += await seerrApi.getRequestCount().then((c) => (c && c.pending) || 0).catch(() => 0)
    if (seerrApi.canManageIssues(perms)) count += await seerrApi.getIssueCount().then((c) => (c && c.open) || 0).catch(() => 0)
    cachedBadge = { count, at: Date.now() }
    if (my.alive) setBadge(count)
  }

  // The sliders a Seerr admin set up, two at a time after the screen's own rows. A missing or
  // failing endpoint leaves them out.
  const loadSliders = async () => {
    let sliders
    try {
      sliders = (await loadDiscoverSliders({ force: true })).filter(isSupportedSlider)
    } catch (e) {
      return
    }
    if (!sliders.length || !my.alive) return
    setSliderConfigs(sliders.map((slider) => ({ id: `slider-${slider.id}`, title: slider.title, type: 'media', fetchFn: 'slider', slider })))
    for (let i = 0; i < sliders.length; i += 2) {
      const group = sliders.slice(i, i + 2)
      const pages = await Promise.all(group.map((slider) => loadSliderPage(slider, 1).catch(() => null)))
      if (!my.alive) return
      const next = { ...data() }
      group.forEach((slider, n) => {
        const page = pages[n]
        if (!page) return
        const id = `slider-${slider.id}`
        next[id] = filterDiscoverItems(page.results)
        my.pages[id] = 1
        my.more[id] = page.totalPages > 1
      })
      setData(next)
    }
  }

  const load = async () => {
    const seerr = await checkSeerr(!seerrState().available)
    if (!my.alive) return
    setEnabled(!!seerr.enabled)
    setAuthenticated(!!seerr.authenticated)
    if (!seerr.available) {
      setLoading(false)
      return
    }
    // The badge and the rows read the same account.
    const userRead = seerrApi.getUser().catch(() => null)
    loadBadge(userRead)
    const empty = { results: [] }
    try {
      // The status call's account, with the API's own answer filling in the rest.
      const apiUser = await userRead
      const contextId = seerr.user && seerr.user.seerrUserId
      const currentUser = contextId ? { id: contextId, ...apiUser } : apiUser
      const perms = currentUser && currentUser.permissions
      const { PERMISSIONS, hasPermission } = seerrApi
      const canViewAllRequests = hasPermission(perms, PERMISSIONS.MANAGE_REQUESTS) || hasPermission(perms, PERMISSIONS.REQUEST_VIEW)
      // Seerr's API leaves this permission for its own pages to check, so it's checked here too.
      const canViewRecentlyAdded = perms == null || hasPermission(perms, PERMISSIONS.RECENT_VIEW)
      const [requestsData, watchlistData, recentlyAddedData, trendingData, moviesData, tvData, genreMovies, genreTv, upMovies, upTv] = await Promise.all([
        (currentUser && currentUser.id) || canViewAllRequests
          ? seerrApi.getRecentRequests(canViewAllRequests ? null : currentUser.id, LOCAL_ROW_LIMIT).catch(() => empty)
          : empty,
        seerrApi.getWatchlist(1).catch(() => empty),
        canViewRecentlyAdded ? seerrApi.getRecentlyAdded(LOCAL_ROW_LIMIT).catch(() => empty) : empty,
        seerrApi.trending(1).catch(() => empty),
        seerrApi.trendingMovies(1).catch(() => empty),
        seerrApi.trendingTv(1).catch(() => empty),
        seerrApi.getGenreSliderMovies().catch(() => []),
        seerrApi.getGenreSliderTv().catch(() => []),
        seerrApi.upcomingMovies(1).catch(() => empty),
        seerrApi.upcomingTv(1).catch(() => empty),
      ])
      const [requests, watchlist, recentlyAdded] = await Promise.all([
        hydrateRequestMediaItems((requestsData.results || []).filter((r) => r && r.media && r.media.tmdbId)),
        hydrateWatchlistItems(watchlistData.results || []),
        hydrateRecentlyAddedItems(recentlyAddedData.results || []),
      ])
      const trending = filterDiscoverItems(trendingData.results)
      // Shuffled once per load, so the tiles keep their stills until the next one.
      const shortcuts = seerrShortcuts().filter((sc) => sc.key !== 'discover')
      const backdrops = pickShortcutBackdrops(shortcuts, shuffled(trending))
      if (!my.alive) return
      setData({
        shortcuts: shortcuts.map((sc) => ({ key: sc.key, name: sc.name(), backdrop: backdrops[sc.key] })),
        recentRequests: requests.map(requestToItem),
        yourWatchlist: watchlist,
        recentlyAdded,
        trending,
        popularMovies: filterDiscoverItems(moviesData.results),
        genreMovies: genreMovies || [],
        upcomingMovies: filterDiscoverItems(upMovies.results),
        studios: MOVIE_STUDIOS,
        popularTv: filterDiscoverItems(tvData.results),
        genreTv: genreTv || [],
        upcomingTv: filterDiscoverItems(upTv.results),
        networks: STREAMING_NETWORKS,
      })
      const paged = { yourWatchlist: watchlistData, trending: trendingData, popularMovies: moviesData, popularTv: tvData, upcomingMovies: upMovies, upcomingTv: upTv }
      Object.keys(paged).forEach((id) => {
        my.pages[id] = 1
        my.more[id] = (paged[id].totalPages || 1) > 1
      })
    } catch (e) {
      console.error('[seerr] discover failed', e)
    }
    batch(() => {
      setLoading(false)
      setRowIndex(0)
      setZone('rows')
    })
    setTimeout(() => my.alive && props.page.active() && focusZone(), 0)
    loadSliders()
  }

  const configOf = (row) => row && rowConfigs().find((c) => c.id === row.configId)
  const onRowMore = async (i) => {
    const config = configOf(rows()[i])
    if (!config || !config.fetchFn || !my.more[config.id] || loadingRows()[config.id]) return
    setLoadingRows({ ...loadingRows(), [config.id]: true })
    try {
      const nextPage = (my.pages[config.id] || 1) + 1
      const page = await fetchPage(config, nextPage)
      if (page && my.alive) {
        const fresh = await pageItems(config, page.results || [])
        const have = {}
        const current = data()[config.id] || []
        current.forEach((it) => {
          have[`${it.mediaType}-${it.id}`] = true
        })
        setData({ ...data(), [config.id]: current.concat(fresh.filter((it) => !have[`${it.mediaType}-${it.id}`])) })
        my.pages[config.id] = nextPage
        my.more[config.id] = nextPage < (page.totalPages || 1)
      }
    } catch (e) {
      console.error(`[seerr] more for ${config.id} failed`, e)
    }
    if (my.alive) setLoadingRows({ ...loadingRows(), [config.id]: false })
  }
  const onRowGrow = (i, h) => {
    const r = rows()[i]
    if (!r || (grows()[r.key] || 0) === h) return
    setGrows({ ...grows(), [r.key]: h })
  }
  // The row that takes focus, or null when the page keeps it (the pills, or nothing to show yet).
  const zoneNode = () => {
    if (loading() || !enabled() || !authenticated() || zone() === 'pills') return null
    const row = rows()[rowIndex()]
    return (row && rowNodes[row.key]) || null
  }
  const focusZone = () => {
    const el = zoneNode()
    if (el) el.setFocus()
    else if (root) root.setFocus()
  }
  const onRowFocus = (i, card) => {
    setRowIndex(i)
    const row = rows()[i]
    if (row) my.curs[row.key] = card.idx
    if (!row || row.kind === 'tile') return
    const item = card.item
    // Only the Classic info panel shows the focused title.
    if (!modern()) setFocusedItem(item)
    clearTimeout(my.backdropTimer)
    my.backdropTimer = setTimeout(() => {
      const path = item && (item.backdrop_path || item.backdropPath)
      if (path) setBackdrop(seerrApi.getImageUrl(path, 'w1280'))
    }, 150)
  }
  const onRowSelect = (i, card) => {
    const row = rows()[i]
    if (!row) return
    if (row.kind !== 'tile') return openSeerrItem(router, card.item)
    const config = configOf(row)
    if (card.kind === 'shortcut') return openSeerrShortcut(router, card.shortcut)
    if (card.kind === 'genre') return router.to(`/seerr/browse/genre/${config.mediaType}/${card.genreId}`, { name: card.genreName })
    if (config.type === 'studio') return router.to(`/seerr/browse/studio/movie/${card.entryId}`, { name: card.entryName })
    router.to(`/seerr/browse/network/tv/${card.entryId}`, { name: card.entryName })
  }
  const openPill = (id) => {
    if (id === 'search') router.to('/search', { preferRequests: true })
    else router.to('/seerr/requests', { tab: 'requests' })
  }

  createEffect(on(props.page.active, (a) => a && (store.navSection = 'seerr')))
  onMount(() => {
    store.navSection = 'seerr'
    focusZone()
    load()
  })

  const L = layout
  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      color="#101010ff"
      linearGradient={SCRIM}
      forwardFocus={() => {
        const el = zoneNode()
        if (!el) return false
        el.setFocus()
        return true
      }}
      onUp={() => {
        if (zone() === 'pills') return focusNav()
        if (rowIndex() > 0) {
          setRowIndex(rowIndex() - 1)
          focusZone()
          return true
        }
        // The pills sit between the rows and the nav, and Up lands on Requests.
        if (showPills()) {
          batch(() => {
            setZone('pills')
            setPillCur(pills().length - 1)
          })
          focusZone()
          return true
        }
        return focusNav()
      }}
      onDown={() => {
        if (zone() === 'pills') {
          batch(() => {
            setZone('rows')
            setRowIndex(0)
          })
          focusZone()
        } else if (rowIndex() < rows().length - 1) {
          setRowIndex(rowIndex() + 1)
          focusZone()
        }
        return true
      }}
      onLeft={() => {
        if (zone() === 'pills' && pillCur() > 0) {
          setPillCur(pillCur() - 1)
          return true
        }
        if (sidebar()) return focusNav()
        return true
      }}
      onRight={() => {
        if (zone() === 'pills' && pillCur() < pills().length - 1) setPillCur(pillCur() + 1)
        return true
      }}
      onEnter={() => {
        if (zone() === 'pills' && showPills()) openPill(pills()[pillCur()].id)
        return true
      }}
      onBack={() => {
        // Back on a scrolled list returns it to the first row before it leaves.
        if (zone() === 'rows' && rowIndex() > 0) {
          setRowIndex(0)
          focusZone()
          return true
        }
        return false
      }}
    >
      <view width={1920} height={1080}>
        <Show when={backdropSrc()}>
          <view width={1920} height={1080} src={backdropSrc()} textureOptions={COVER} linearGradient={SCRIM} />
        </Show>
      </view>

      <view>
        <Show when={info()}>
          {(nf) => (
            <view>
              <text
                x={L().infoLeft}
                y={L().pillsTop + cssShift(40)}
                fontFamily={nf().titleFont}
                fontSize={40}
                lineHeight={53}
                maxWidth={1840 - L().infoLeft}
                maxLines={1}
                color="#ffffffff"
              >
                {nf().title}
              </text>
              <text
                x={L().infoLeft}
                y={L().pillsTop + 96 + cssShift(20)}
                fontFamily={nf().overviewFont}
                fontSize={20}
                lineHeight={28}
                maxWidth={1840 - L().infoLeft}
                maxLines={3}
                color="#ffffffcc"
              >
                {nf().overview}
              </text>
              <For each={nf().meta}>
                {(mt) => (
                  <text x={L().infoLeft + mt.x} y={L().pillsTop + 56 + cssShift(23)} fontFamily={infoFont} fontSize={23} lineHeight={33} color={mt.color}>
                    {mt.text}
                  </text>
                )}
              </For>
              <Show when={nf().star >= 0}>
                <view x={L().infoLeft + nf().star} y={L().pillsTop + 59} width={27} height={27} src="icons/star.webp" color="#ff9800ff" />
              </Show>
            </view>
          )}
        </Show>
      </view>

      <view y={listTop()} width={1920} height={1080 - listTop()} clipping>
        <view y={-listScroll()} width={1920} height={Math.max(1080, listH())}>
          <For each={list.keys()}>
            {(k) => {
              const r = list.item(k)
              const key = r().key
              let mine
              const keep = (n) => (mine = rowNodes[key] = n)
              onCleanup(() => rowNodes[key] === mine && delete rowNodes[key])
              return r().kind === 'modern' ? (
                <SeerrMediaRow
                  ref={keep}
                  startIndex={my.curs[key] || 0}
                  y={ys()[r().i] || 0}
                  row={r()}
                  rowIndex={r().i}
                  look={coreLook()}
                  onRowFocus={onRowFocus}
                  onRowSelect={onRowSelect}
                  onRowMore={onRowMore}
                  onRowGrow={onRowGrow}
                />
              ) : (
                <DiscoverRow
                  ref={keep}
                  startIndex={my.curs[key] || 0}
                  y={ys()[r().i] || 0}
                  row={{ ...r(), loading: !!loadingRows()[key] }}
                  rowIndex={r().i}
                  look={tileLook()}
                  onRowFocus={onRowFocus}
                  onRowSelect={onRowSelect}
                  onRowMore={onRowMore}
                />
              )
            }}
          </For>
        </view>
      </view>

      <view>
        <Show when={showPills()}>
          <For each={pills()}>
            {(p) => (
              <SeerrPill
                x={p.x}
                y={L().pillsTop}
                label={p.label}
                icon={p.icon}
                badge={p.badge}
                focused={zone() === 'pills' && pillCur() === p.i}
                ring={t().focus}
              />
            )}
          </For>
        </Show>
      </view>
      <view>
        <Show when={loading() && enabled() && authenticated()}>
          <Spinner x={924} y={504} size={72} />
        </Show>
      </view>
      <view>
        <Show when={notice()}>
          {(n) => (
            <view>
              <text x={960} y={532 - 41 + cssShift(24)} mountX={0.5} fontFamily={noticeFont} fontSize={24} lineHeight={33} color="#888888ff">
                {n().a}
              </text>
              <text x={960} y={532 + 8 + cssShift(24)} mountX={0.5} fontFamily={noticeFont} fontSize={24} lineHeight={33} color="#888888ff">
                {n().b}
              </text>
            </view>
          )}
        </Show>
      </view>
    </view>
  )
}
