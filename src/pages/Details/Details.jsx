import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import { Dynamic } from '@solidtv/solid'
import ActionButtons from '../../ui/components/details/ActionButtons.jsx'
import TabBar from '../../ui/components/details/TabBar.jsx'
import TabCells from '../../ui/components/details/TabCells.jsx'
import UpNextCard from '../../ui/components/details/UpNextCard.jsx'
import Overview from '../../ui/components/details/Overview.jsx'
import FileInfo from '../../ui/components/details/FileInfo.jsx'
import SeerrTab from '../../ui/components/details/SeerrTab.jsx'
import SeerrStatusDownloads, { downloadsLayout, pollSeerr, withDownloads } from '../../ui/components/seerr/SeerrStatusDownloads.jsx'
import { byKey } from '../../ui/components/details/keyed.js'
import { appHidden } from '../../ui/components/details/env.js'
import { fontFor } from '../../ui/text.js'
import { hex } from '../../ui/color.js'
import { textWidth, whenReady, wrapLines } from '../../ui/components/details/measure.js'
import { getServerType, getServerUrl, getApiKey } from '../../services/jellyfinApi.js'
import * as userDataSync from '../../services/userDataSync.js'
import { withoutBlockedItems } from '../../services/parentalControls.js'
import { startServerShuffle } from '../../services/serverShuffle.js'
import { buildDisplayRatings, fetchEpisodeRatings, fetchRatings, getContentType, getTmdbId, isMdblistEnabled, isRatingSourceEnabled } from '../../services/mdblistApi.js'
import { searchesForTrailer } from '../../services/youtubeTrailer.js'
import { formatDuration, getBackdropId, getImageUrl, getLogoUrl } from '../../utils/helpers.js'
import { formatPlaybackEndsAt } from '../../utils/playbackTimeLabels.js'
import { formatFileSize } from '../../utils/formatFileSize.js'
import { fetchUpcomingEpisode, formatUpcomingEpisode } from '../../utils/upcomingEpisode.js'
import { personCalendarDate, splitFilmography } from '../../utils/personCredits.js'
import { isRatableItemType, normalizeRatingStyle } from '../../utils/personalRating.js'
import { isKidsMode, kidsModeSettings } from '../../utils/kidsMode.js'
import { sectionVisibility } from '../../utils/detailSectionLayout.js'
import { cleanOverview } from '../../utils/overviewText.js'
import { scrimSrc } from '../../utils/scrimImage.js'
import { pickEpisodePlayTarget, shouldResumeTarget } from '../../utils/episodePlayTarget.js'
import { collectionPlayTarget, collectionQueue } from '../../utils/collectionPlayback.js'
import { fetchPrerolls } from '../../utils/cinemaMode.js'
import { all } from '../../state/settings.js'
import { getActivePage } from '../../state/pages.js'
import { getStore, toast } from '../../state/store.js'
import { browseRefresh } from '../../state/browseCache.js'
import { sideNavRoom, navOnLeft } from '../../ui/theme.js'
import { router } from '../../app/router.js'
import { focusNav } from '../../app/focus.js'
import { usePage } from '../../app/PageStack.jsx'
import { COLLECTION_ITEM_TYPES, IDENTIFIABLE_TYPES, getMediaBadges, hidesMediaDescription, splitCastAndCrew } from './detailsMedia.js'
import { shuffled } from '../../utils/shuffled.js'
import { orderItemsByIds } from './collectionPlaylist.js'
import { collectionTitles, mergeCollectionWithMissing } from './seerrMissingCollectionItems.js'
import { studioLogoIndex, studioCardsFor } from './studioLogos.js'
import {
  apiFor,
  chooseCollectionSort,
  emptyLists,
  initialTracks,
  loadEpisodeRatings,
  loadLists,
  loadMoreCollectionItems,
  loadRecord,
  loadReviews,
  peopleOf,
  readCollectionTitles,
} from './load.js'
import { idleSeerr, loadSeerrOverlay } from './seerr.js'
import { isSeerrOnlyItem } from '../../utils/seerrTarget.js'
import { bookSeriesFor, openBookSeries } from './bookSeries.js'
import { detailsData, playRoute, withServer } from '../../state/libraryRoutes.js'
import { bookReader } from '../../utils/books.js'
import { incompleteLineFor, loadAnimeMarks } from './detailMarks.js'
import { canKeepAsComplete, keepAsComplete, onIncompleteRecordings } from '../../services/incompleteRecordings.js'
import { loadBookSeries } from '../../ui/components/books/bookLibraryData.js'
import { loadSeerrOnlyRecord, seerrOnlyOverlay } from '../Seerr/seerrOnly.js'
import { layoutHero, contentLeft, overviewHeight, PAD_BOTTOM, SCREEN_W, PAD_RIGHT, ratingEntries } from './modern/hero.js'
import { metaPieces, ratingValues } from './modern/meta.js'
import { actionRow } from './modern/actions.js'
import { layoutTab, tabsFor } from './modern/tabs.js'
import { detailTokens } from './modern/tokens.js'
import { PLAYED_ALL, PLAYLIST_SORT_ORDER, PLAYLIST_SORT_RANDOM, SORT_DIR_ASC, sortAndFilterPlaylistTracks, sortLabel } from '../../utils/playlistSortFilter.js'
import { scrollFor } from './modern/scroll.js'
import { drawsMinimalist } from './minimalist/minimalistRules.js'
import { drawsStage } from './stage/stageRules.js'
import { STYLES, MODALS } from './parts.js'
import { alphaHex } from '../../ui/themeColor.js'

// Every item type opens here, people, albums and artists included. Modern draws on this page, and
// the other styles draw in their own components (parts.js) from what it loads and works out.
// `mediatype` marks a title only Seerr knows, `bookSeries` keys the book series the page carries,
// `server` holds another server's item, and `quickLook` comes with onQuickLookClose() and
// onQuickLookFull(pick) when Quick Look's drawer holds the page.
const SCRIM = [
  { to: 'right', rgb: '11, 13, 16', stops: [[0, 1], [0.35, 0.9], [0.6, 0.45], [0.85, 0]] },
  { to: 'top', rgb: '11, 13, 16', stops: [[0, 1], [0.42, 0.4], [0.8, 0]] },
  { at: [0.72, 0.28], rgb: '0, 0, 0', stops: [[0.42, 0], [1, 0.45]] },
]
const PERSON_SCRIM = [{ to: 'top', rgb: '11, 13, 16', stops: [[0, 1], [0.5, 0.6], [1, 0.45]] }]
const VIEW_H = 1080
// Longest the action row waits for the loads that add its buttons.
const ACTIONS_WAIT_MS = 250
const NO_SEASONS = new Map()
const ARTWORK_TYPES = ['Movie', 'Episode', 'Series', 'Season', 'Audio', 'MusicAlbum', 'BoxSet', 'Folder', 'CollectionFolder', 'UserView', 'Genre', 'MusicGenre']
const EMPTY_HERO = { rects: [], imgs: [], texts: [] }
const NO_OV = { show: false, x: 0, y: 0, text: '', font: 'roboto', box: null }
const NO_TC = { kind: 'none', cells: [], headings: [], y: 0, info: null, seerr: null }
const NO_TB = { tabs: [], x: 0, y: 0, active: '', maxW: 1688 }
const GONE = { k: '', x: 0, y: 0, w: 0, h: 0, r: 0, color: '#00000000', bw: 0, bc: '#00000000', src: '', text: '', size: 20, font: 'roboto', lh: 0, maxw: 0, maxlines: 0, ls: 0 }
const SCROLL = { y: { duration: 260, easing: 'ease-out' } }
// The scrolling page and every layer in it take this height when they're made, as views with no size
// of their own do, so it covers the longest page. A layer shorter than the page stops drawing once it
// scrolls off.
const PAGE_H = 100000

// The tag of the backdrop getBackdropId picks. With it the server lets the TV keep the picture
// (max-age a year), where without it every open fetched the 1920 picture again.
const backdropTag = (it) => ((it.BackdropImageTags && it.BackdropImageTags.length ? it.BackdropImageTags : it.ParentBackdropImageTags) || [])[0]

// hero.js marks the tagline's italics with [i] tags, and this renderer takes a font style instead.
const plain = (tx) => (tx.rich ? String(tx.text).replace(/^\[i\]/, '').replace(/\[\/i\]$/, '') : tx.text)

export default function Details(props) {
  const store = getStore()
  const page = usePage()
  const [loading, setLoading] = createSignal(true)
  const [blocked, setBlocked] = createSignal(false)
  const [backdrop, setBackdrop] = createSignal('')
  const [backdropShade, setBackdropShade] = createSignal('#00000000')
  const [scrim, setScrim] = createSignal('')
  const [hero, setHero] = createSignal(EMPTY_HERO)
  const [logoProbe, setLogoProbe] = createSignal('')
  const [ov, setOv] = createSignal(NO_OV)
  const [overviewExpanded, setOverviewExpanded] = createSignal(false)
  const [act, setAct] = createSignal({ buttons: [], x: 0, y: 0, w: 1595, held: true, glass: null })
  const [dl, setDl] = createSignal({ y: 0, bars: { rects: [], icons: [], texts: [], h: 0 } })
  const [un, setUn] = createSignal({ show: false, x: 0, y: 0, card: null })
  const [tb, setTb] = createSignal(NO_TB)
  const [tc, setTc] = createSignal(NO_TC)
  const [scroll, setScroll] = createSignal(0)
  const [zone, setZone] = createSignal('actions')
  // The theme's colors, worked out again only when the theme changes.
  const tokens = createMemo(() => detailTokens())
  const [skeleton, setSkeleton] = createSignal([])
  // The Details Screen Style drawing the page. Modern draws here, the others in their own component.
  const [style, setStyle] = createSignal('v2')
  const rects = byKey(() => hero().rects, GONE)
  const imgs = byKey(() => hero().imgs, GONE)
  const texts = byKey(() => hero().texts, GONE)

  // What this page holds about one item, outside the signals.
  const m = { gen: 0 }
  const refs = {}
  let styled = null
  let modals = null
  let settleTimer = null
  let seerrPoll = null
  // A title opened to play (a card menu's Play, Default Action Play, a Smart Hub tile) starts once
  // its record and the lists it plays from are in, as its own Play or Resume would, and stays under
  // the player, so Back lands here. It plays once per page.
  let autoPlay = Boolean(props.autoPlay)
  // The record is asked for before the page builds, which takes a TV a few hundred ms of its own.
  let early = props.mediatype ? null : { id: props.id, rec: loadRecord(props.id, null, props.server) }
  const modal = (name, ...args) => (modals && modals[name] ? modals[name](...args) : undefined)
  const settings = () => kidsModeSettings(all())

  // Which style draws this item. Every style but Classic hands a playlist to Modern, and a style
  // with no component falls back to Modern too.
  const styleOf = (it) => {
    const st = settings().detailScreenStyle
    // Quick Look draws its drawer only for what Stage draws, and its full page is Modern.
    if (props.quickLook) return STYLES.v8 ? 'v8' : 'v2'
    if (st === 'v8') return 'v2'
    if (st === 'v2' || (it && it.Type === 'Playlist' && st !== 'v1')) return 'v2'
    // Minimalist hands what it doesn't draw to Spotlight, and Stage, Premiere and Frost to Modern.
    if (it && st === 'v5' && !drawsMinimalist(it.Type)) return STYLES.v3 ? 'v3' : 'v2'
    if (it && (st === 'v6' || st === 'v7' || st === 'v9') && !drawsStage(it.Type)) return 'v2'
    return STYLES[st] ? st : 'v2'
  }
  const pickStyle = (it) => {
    const st = styleOf(it)
    if (st !== untrack(style)) {
      styled = null
      setStyle(st)
    }
    return st !== 'v2' ? styled : null
  }

  // Everything this page holds about one item, reset whenever it opens another.
  const start = () => {
    const gen = ++m.gen
    const alive = () => gen === m.gen
    m.item = null
    // An item from another server is read, drawn and acted on through that server.
    m.api = apiFor(props.server)
    m.srv = (props.server && props.server._serverUrl) || getServerUrl()
    m.token = (props.server && props.server._serverAccessToken) || getApiKey()
    m.bookSeries = bookSeriesFor(props.bookSeries)
    m.anime = null
    m.lists = emptyLists()
    m.tracks = { version: 0, audio: 0, subtitle: -1 }
    m.chosen = { audio: false, subtitle: false }
    m.seerr = idleSeerr()
    m.seerrDone = false
    m.ratings = []
    m.companies = null
    m.upcoming = ''
    m.logo = null
    m.collection = {}
    m.activeTab = null
    m.settled = false
    m.focusedCell = null
    m.pl = { sortBy: PLAYLIST_SORT_ORDER, sortDirection: SORT_DIR_ASC, playedFilter: PLAYED_ALL, favoriteOnly: false, mediaTypeFilter: null, seed: 42 }
    clearTimeout(settleTimer)
    clearTimeout(seerrPoll)
    batch(() => {
      setScroll(0)
      setZone('actions')
      setOverviewExpanded(false)
      setBlocked(false)
      setLoading(true)
      setBackdrop('')
      setScrim('')
      setLogoProbe('')
      setHero(EMPTY_HERO)
      setTb(NO_TB)
      setTc(NO_TC)
    })
    const sty = pickStyle(null)
    setSkeleton(sty && sty.skeletonBoxes ? sty.skeletonBoxes() : skeletonBoxes())
    const ctx = {
      alive,
      set: (patch) => {
        if (!alive()) return
        Object.keys(patch).forEach((k) => (m.lists[k] = withServer(props.server, patch[k])))
        paintSoon()
        if (patch.playListsLoaded) playOnArrival()
      },
      get: () => m.lists,
      collection: m.collection,
    }
    m.ctx = ctx
    loadAll(ctx).catch((e) => console.error('[details] load failed', e))
  }

  const loadAll = async (ctx) => {
    const s = settings()
    const pre = early && early.id === props.id ? early.rec : null
    early = null
    const rec = props.mediatype ? await loadSeerrOnlyRecord(props.mediatype, props.id) : await (pre || loadRecord(props.id, null, props.server))
    if (!ctx.alive()) return
    if (!rec || rec.blocked) {
      if (!rec) toast($L('Failed to load details'))
      batch(() => {
        setBlocked(!!rec)
        setLoading(false)
        setSkeleton([])
      })
      return
    }
    const item = rec.item
    // The backdrop starts loading while the page lays out, so its decode (on the TV's main thread)
    // goes up ahead of the page's smaller pictures rather than behind them.
    if (styleOf(item) === 'v2') {
      const b = backLayers(item, s)
      batch(() => {
        setBackdrop(b.back)
        setBackdropShade(b.shade)
        setScrim(b.scrimUrl)
      })
    }
    await whenReady()
    if (!ctx.alive()) return
    m.item = item
    showNav()
    m.lists.cast = withServer(props.server, peopleOf(item))
    // The page draws before the tracks it opens on are worked out (that can read the season first),
    // and they land a moment later unless one was picked here meanwhile.
    const shownTracks = m.tracks
    initialTracks(item)
      .then((tr) => {
        if (!ctx.alive() || m.tracks !== shownTracks) return
        m.tracks = tr
        if (tr.version !== shownTracks.version || tr.audio !== shownTracks.audio || tr.subtitle !== shownTracks.subtitle) paintSoon()
      })
      .catch(() => {})
    batch(() => {
      setLoading(false)
      setSkeleton([])
      paint()
    })
    settleTimer = setTimeout(() => settle(ctx), ACTIONS_WAIT_MS)
    setTimeout(() => {
      if (ctx.alive() && isActive()) focusZone('actions')
    }, 0)

    const showsSection = sectionVisibility(s.hiddenDetailSectionsTv)
    const jobs = [
      (isSeerrOnlyItem(item) ? Promise.resolve(ctx.set({ playListsLoaded: true })) : loadLists(item, ctx)).then(() => maybeSettle(ctx)),
      loadSeerrOverlay(item, showsSection)
        .then(withDownloads)
        .then((seerr) => {
          if (!ctx.alive()) return
          m.seerr = isSeerrOnlyItem(item) ? seerrOnlyOverlay(seerr) : seerr
          m.seerrDone = true
          paintSoon()
          armSeerrPoll()
          maybeSettle(ctx)
        }),
      loadRatings(item).then((r) => {
        if (!ctx.alive()) return
        m.ratings = r
        paintSoon()
      }),
      loadReviews(item).then((r) => ctx.set({ reviews: r || [] })),
      loadEpisodeRatings(item).then((r) => ctx.set({ episodeRatings: r })),
      loadStudios(item).then((c) => {
        if (!ctx.alive()) return
        m.companies = c
        paintSoon()
      }),
      loadAnimeMarks(item, s).then((mk) => {
        if (!ctx.alive()) return
        m.anime = mk
        paintSoon()
      }),
      loadUpcoming(item).then((u) => {
        if (!ctx.alive()) return
        m.upcoming = u
        paintSoon()
      }),
    ]
    await Promise.all(jobs.map((j) => j.catch((e) => console.error('[details]', e))))
    m.seerrDone = true
    maybeSettle(ctx)
  }
  const playOnArrival = () => {
    const it = m.item
    if (!autoPlay || !it || isSeerrOnlyItem(it)) return
    autoPlay = false
    if (props.onAutoPlayed) props.onAutoPlayed()
    if (it.UserData && it.UserData.PlaybackPositionTicks > 0) playOwn(true)
    else play()
  }
  const maybeSettle = (ctx) => {
    if (m.lists.playListsLoaded && m.seerrDone) settle(ctx)
  }
  const settle = (ctx) => {
    if (!ctx.alive() || m.settled || !m.item) return
    m.settled = true
    setAct({ ...untrack(act), held: false })
    // A layout still waiting on loads that just landed goes in before the row shows.
    if (paintTimer !== null || untrack(style) !== 'v2') paint()
  }
  const loadRatings = (item) => {
    const s = settings()
    if (!isMdblistEnabled(s) || item.Type === 'Person') return Promise.resolve([])
    const server = m.srv
    if (item.Type === 'Episode') {
      if (s.tmdbEpisodeRatingsEnabled !== true || !isRatingSourceEnabled(s, 'tmdb')) return Promise.resolve([])
      return fetchEpisodeRatings(server, item)
        .then((r) => buildDisplayRatings(r, server))
        .catch(() => [])
    }
    if (!getContentType(item) || (!getTmdbId(item) && item.Type !== 'Series')) return Promise.resolve([])
    const sourcesKey = Array.isArray(s.mdblistRatingSources) ? s.mdblistRatingSources.join(',') : ''
    return fetchRatings(server, item, { sourcesKey })
      .then((r) => buildDisplayRatings(r, server))
      .catch(() => [])
  }
  const loadStudios = (item) => {
    const s = settings()
    const tmdbId = item.ProviderIds && item.ProviderIds.Tmdb
    if (!s.useMoonfinPlugin || !tmdbId || !(item.Studios && item.Studios.length) || !m.api.getStudioCompanies) return Promise.resolve(null)
    return m.api
      .getStudioCompanies(tmdbId, item.Type === 'Series' ? 'tv' : 'movie')
      .then((res) => (res && res.success && Array.isArray(res.companies) ? res.companies : null))
      .catch(() => null)
  }
  const loadUpcoming = (item) => {
    if (item.Type !== 'Series' && item.Type !== 'Season') return Promise.resolve('')
    return fetchUpcomingEpisode({ item, settings: settings(), serverUrl: m.srv, serverToken: m.token })
      .then((res) => formatUpcomingEpisode(res) || '')
      .catch(() => '')
  }
  // Watched and favorite changes from this page, the player or another device.
  const synced = () => {
    if (!m.item) return
    const next = userDataSync.apply(m.item)
    let changed = next !== m.item
    m.item = next
    ;['seasons', 'episodes', 'similar', 'extras', 'nextUp', 'collectionItems', 'playlistItems', 'albumTracks', 'artistAlbums'].forEach((k) => {
      const v = userDataSync.applyAll(m.lists[k])
      if (v !== m.lists[k]) {
        m.lists[k] = v
        changed = true
      }
    })
    if (changed) paint()
  }

  // The placeholder boxes Modern shows while the record loads.
  const skeletonBoxes = () => {
    const x = contentLeft(sideNavRoom(all()))
    const tok = untrack(tokens)
    const box = tok.isGlass ? '#ffffff29' : tok.os(0.14)
    const out = [{ k: 'bg', x: 0, y: 0, w: 1920, h: 594, r: 0, top: '#ffffff19', bottom: '#ffffff00' }]
    let y = 135
    const add = (k, bx, w, h, r) => out.push({ k, x: bx, y, w, h, r, color: box })
    add('logo', x, 408, 109, 8)
    y += 109 + 9
    add('title', x, 672, 52, 8)
    y += 52 + 9
    ;[90, 115, 77, 96].reduce((bx, w, i) => {
      add(`m${i}`, bx, w, 20, 4)
      return bx + w + 24
    }, x)
    y += 20 + 9
    add('rating', x, 104, 64, 6)
    y += 64 + 35
    add('play', x, 203, 78, 39)
    ;[0, 1, 2, 3].forEach((i) => out.push({ k: `c${i}`, x: x + 203 + 12 + i * 86, y: y + 2, w: 74, h: 74, r: 37, color: box }))
    y += 78 + 23
    ;[153, 119, 119, 145, 128].reduce((bx, w, i) => {
      add(`t${i}`, bx, w, 55, 28)
      return bx + w + 24
    }, x)
    return out
  }

  // The backdrop and its scrim. Modern's blur setting only sets how dark the scrim is.
  const backLayers = (it, s) => {
    const isPerson = it.Type === 'Person'
    const blur = Number(s.backdropBlurDetail != null ? s.backdropBlurDetail : 20)
    const opacity = Math.min(1, blur / 25)
    const scale = 0.3 + 0.7 * opacity
    const backId = getBackdropId(it)
    let back = s.detailsBackdropEnabled !== false && !isPerson && backId ? getImageUrl(m.srv, backId, 'Backdrop', { maxWidth: 1920, quality: 90, tag: backdropTag(it) }) : ''
    if (it._externalBackdropUrl && s.detailsBackdropEnabled !== false) back = it._externalBackdropUrl
    const shade = `#000000${alphaHex(opacity * (isPerson ? 0.4 : 0.8))}`
    const scrimUrl = scrimSrc(isPerson ? PERSON_SCRIM : SCRIM, scale)
    return { back, shade, scrimUrl }
  }

  // The whole page from what has loaded so far. Loads landing together (several answer at once, or
  // straight from a cache) lay it out once, in the next task, rather than once each.
  let paintTimer = null
  const paint = () => {
    clearTimeout(paintTimer)
    paintTimer = null
    batch(paintNow)
  }
  const paintSoon = () => {
    if (paintTimer === null) paintTimer = setTimeout(paint, 0)
  }
  const paintNow = () => {
    const it = m.item
    if (!it) return
    const s = settings()
    const t = it.Type
    const L = m.lists
    const tok = untrack(tokens)
    const showsSection = sectionVisibility(s.hiddenDetailSectionsTv)
    const isPerson = t === 'Person'
    const server = m.srv
    const left = contentLeft(sideNavRoom(s))
    const { back, shade, scrimUrl } = backLayers(it, s)

    const ms = (it.MediaSources || [])[m.tracks.version] || (it.MediaSources || [])[0]
    const supportsSelection = it.MediaType === 'Video' && !!(it.MediaSources && it.MediaSources.length) && it.MediaSources[0].Type !== 'Placeholder'
    const audioStreams = ((ms && ms.MediaStreams) || []).filter((x) => x.Type === 'Audio')
    const showTech = Boolean(s.detailShowTechnicalDetails)
    const techChips = showTech ? getMediaBadges(it, m.tracks.version).map((b) => b.label) : []
    const techSize = showTech && t !== 'Series' && t !== 'Season' ? formatFileSize(ms && ms.Size) : null
    const split = splitCastAndCrew(L.cast, 20, t === 'Episode')
    const cast = showsSection('cast') ? split.cast : []
    const crew = showsSection('crew') ? split.crew : []
    const similar = isPerson || showsSection('moreLikeThis') ? L.similar : []
    const filmography = isPerson ? splitFilmography(L.similar, showsSection, s.personPageSortOption) : null
    const parentCollections = showsSection('collections') ? L.parentCollections : []
    const showsMissing = s.seerrShowMissingCollectionItems !== false
    const collectionSections = parentCollections.map((c) => ({
      id: c.id,
      name: c.name,
      items: [c.boxSetItem].concat(showsMissing ? mergeCollectionWithMissing(c.items || [], c.missingItems) : c.items || []).filter(Boolean),
    }))
    const collectionItems = t === 'BoxSet' ? collectionTitles(L.collectionItems, L.missingCollectionItems, s) : L.collectionItems
    const nextUp = showsSection('upNext') ? L.nextUp : []
    const extras = showsSection('extras') ? L.extras : []
    const studios = showsSection('studios') ? it.Studios : undefined
    const studioCards = studioCardsFor(studios, studioLogoIndex(m.companies, server, m.token))
    const pl = m.pl
    const playlistTracks =
      t === 'Playlist'
        ? sortAndFilterPlaylistTracks({
            tracks: L.playlistItems,
            sortBy: pl.sortBy,
            sortDirection: pl.sortDirection,
            playedFilter: pl.playedFilter,
            favoriteOnly: pl.favoriteOnly,
            mediaTypeFilter: pl.mediaTypeFilter,
            randomSeed: pl.seed,
          })
        : []
    m.shownTracks = playlistTracks
    const filterCount = (pl.favoriteOnly ? 1 : 0) + (pl.playedFilter !== PLAYED_ALL ? 1 : 0) + (pl.mediaTypeFilter && pl.mediaTypeFilter !== 'all' ? 1 : 0)
    const sortActive = pl.sortBy !== PLAYLIST_SORT_ORDER || pl.sortDirection !== SORT_DIR_ASC
    const playlistBar =
      t === 'Playlist'
        ? {
            sortText:
              sortLabel(pl.sortBy) +
              (pl.sortBy !== PLAYLIST_SORT_RANDOM && pl.sortBy !== PLAYLIST_SORT_ORDER ? ` ${pl.sortDirection === SORT_DIR_ASC ? '▲' : '▼'}` : ''),
            sortActive,
            filterCount,
            modified: sortActive || filterCount > 0,
            empty: !L.playlistItems.length ? $L('This playlist is empty') : !playlistTracks.length ? $L('No tracks match the active filters') : '',
            emptyFiltered: L.playlistItems.length > 0 && !playlistTracks.length,
          }
        : null
    const runtime = it.RunTimeTicks ? formatDuration(it.RunTimeTicks) : ''
    const endsAt = formatPlaybackEndsAt(it.RunTimeTicks / 10000000, s.clockDisplay, s.timeOffsetHours)
    const ratingStyle = normalizeRatingStyle(s.personalRatingStyle)
    const hasTrailer = isSeerrOnlyItem(it)
      ? (it.RemoteTrailers || []).length > 0
      : it.LocalTrailerCount > 0 ||
        (it.RemoteTrailers && it.RemoteTrailers.length > 0) ||
        t === 'Series' ||
        (t === 'Movie' && searchesForTrailer(it, getServerType()))
    const user = store && store.user
    const admin = !!(user && user.Policy && user.Policy.IsAdministrator) && getServerType() === 'jellyfin'
    const hasUpNext = Boolean(nextUp[0])
    const hasTech = Boolean(techSize) || techChips.length > 0
    const hideDescription = hidesMediaDescription(it, s)
    const incomplete = isPerson ? '' : incompleteLineFor(it, s.clockDisplay)
    const anime = m.anime
    m.view = { s, ms }

    const logoUrl = showsSection('logo') ? getLogoUrl(server, it, { maxWidth: 400, quality: 90 }) : null
    if (logoUrl && (!m.logo || m.logo.url !== logoUrl)) {
      m.logo = { url: logoUrl, w: 0, h: 0, failed: false }
      setLogoProbe(logoUrl)
    }
    const logoLive = Boolean(logoUrl && m.logo && !m.logo.failed && !isPerson)
    const isEpisode = t === 'Episode'
    // The logo box runs the full max width, as tall as the logo's shape asks up to the max height,
    // and the logo sits in it left aligned and centered, scaled to fit.
    let logo = null
    if (logoLive) {
      const max = isEpisode ? { w: 522, h: 131 } : { w: 435, h: 109 }
      const nw = m.logo.w
      const nh = m.logo.h
      const boxH = nw ? Math.min(max.h, (max.w * nh) / nw) : 0
      const k = nw ? Math.min(max.w / nw, boxH / nh) : 0
      logo = { url: m.logo.url, w: nw * k, h: nh * k, boxH }
    }
    const posterUrl = isPerson && it.ImageTags && it.ImageTags.Primary ? getImageUrl(server, it.Id, 'Primary', { maxHeight: 600, quality: 90 }) : null
    const birth = isPerson ? personCalendarDate(it.PremiereDate) : null
    const birthPlace = isPerson && showsSection('birthplace') && it.ProductionLocations && it.ProductionLocations.length ? it.ProductionLocations[0] : ''
    const born = isPerson ? [birth ? birth.getFullYear() : null, birthPlace || null].filter(Boolean).join(' · ') : ''
    const meta = isPerson
      ? []
      : metaPieces({
          item: it,
          settings: s,
          year: it.ProductionYear || '',
          officialRating: it.OfficialRating || '',
          runtime,
          endsAt,
          seasonCount: it.ChildCount || L.seasons.length || 0,
          genres: it.Genres || [],
          episodes: L.episodes,
          episodeRatings: L.episodeRatings,
          playlistTracks,
          upcomingText: m.upcoming,
          seerr: m.seerr,
        })
    const ratings = isPerson ? [] : ratingEntries(ratingValues(it, s, m.ratings))
    const overviewText = cleanOverview(isPerson && !showsSection('biography') ? '' : it.Overview || '')
      .replace(/\s+/g, ' ')
      .trim()
    const tagline = showsSection('tagline') && it.Taglines && it.Taglines[0]
    const actionInput = {
      item: it,
      settings: s,
      seerr: m.seerr,
      seerrOnly: isSeerrOnlyItem(it),
      serverUrl: server,
      playlistTracks: t === 'Playlist' ? playlistTracks : undefined,
      hasMultipleVersions: supportsSelection && (it.MediaSources || []).length > 1,
      hasMultipleAudio: supportsSelection && audioStreams.length > 1,
      supportsMediaSourceSelection: supportsSelection,
      hasTrailer,
      inSyncPlayGroup: false,
      showsPersonalRating: isRatableItemType(t) && getServerType() !== 'plex',
      ratingStyle,
      canAddToCollection: COLLECTION_ITEM_TYPES.indexOf(t) >= 0,
      canChangeArtwork: admin && ARTWORK_TYPES.indexOf(t) >= 0,
      canIdentify: admin && IDENTIFIABLE_TYPES.indexOf(t) >= 0,
      canKeepAsComplete: Boolean(incomplete) && canKeepAsComplete(),
      resumeTimeText: it.UserData && it.UserData.PlaybackPositionTicks > 0 ? formatDuration(it.UserData.PlaybackPositionTicks) : '',
      isReadableBook: t === 'Book' && !!bookReader(it),
      offersStreamOptions: supportsSelection && !isKidsMode(s),
      bookSeriesItem: m.bookSeries,
    }

    // Every style but Modern draws in its own component, from what this page has worked out.
    if (props.quickLook && !drawsStage(t)) return openFullPage(it, true)
    const sty = pickStyle(it)
    if (sty) {
      setBackdrop('')
      setScrim('')
      setBackdropShade('#00000000')
      sty.paint({
        item: it, settings: s, lists: L, tokens: tok, showsSection, server, left, backdropUrl: back, mediaSource: ms, tracks: m.tracks,
        supportsSelection, audioStreams, techChips, techSize, cast, crew, similar, filmography, parentCollections, collectionSections,
        collectionItems, nextUp, extras, studios, studioCards, playlistTracks, playlistBar, runtime, endsAt, ratingStyle, hasTrailer,
        admin, hideDescription, logoUrl, logoLive, logoSize: m.logo, posterUrl, born, birthPlace, meta, ratings, mdbRatings: m.ratings,
        overviewText, tagline: tagline || '', seerr: m.seerr, upcoming: m.upcoming, actionInput, settled: m.settled,
        bookSeriesItem: m.bookSeries, incomplete, anime,
      })
      return
    }
    setBackdrop(back)
    setBackdropShade(shade)
    setScrim(scrimUrl)

    const upNextCard = hasUpNext ? upNextCardFor(nextUp[0], s) : null
    const laid = layoutHero(
      {
        left,
        hasUpNext,
        upNextH: upNextCard ? upNextCard.h : 0,
        avatar: posterUrl,
        seriesLabel: isEpisode && !logoLive && it.SeriesName ? it.SeriesName : '',
        logo,
        title: isEpisode || !logoLive ? (m.bookSeries ? m.bookSeries.Name : it.Name) || '' : '',
        born,
        meta,
        incomplete,
        anime,
        techSize,
        techChips,
        ratings,
        ratingStyle: { labels: s.showRatingLabels !== false, badges: s.showRatingBadges !== false },
        tagline: tagline || '',
        overview: overviewText,
        overviewExpanded: untrack(overviewExpanded),
        hideDescription,
        hasTech,
      },
      tok,
    )
    setHero({ rects: laid.rects, imgs: laid.imgs.filter((im) => !im.logo || im.w > 0), texts: laid.texts })
    m.hero = laid
    setOv(laid.overview ? { show: true, x: laid.overview.x, y: laid.overview.y, text: overviewText, font: fontFor(overviewText), box: laid.overview.box } : NO_OV)

    const row = actionRow(actionInput)
    m.behind = row.behind
    setAct({ buttons: row.buttons, x: left, y: laid.actionsY, w: laid.mainW, held: !m.settled, glass: glassFor(it, back, shade, scrimUrl) })

    m.nextUp = nextUp[0] || null
    setUn(laid.upNext ? { show: true, x: laid.upNext.x, y: laid.upNext.y, card: upNextCard } : { show: false, x: 0, y: 0, card: null })

    const contentW = SCREEN_W - PAD_RIGHT - left
    const tabData = {
      item: it, settings: s, showsSection, extras, supportsMediaSourceSelection: supportsSelection, mediaSource: ms,
      collectionSections, seasons: L.seasons, episodes: L.episodes, personMovies: filmography ? filmography.movies : [],
      personSeries: filmography ? filmography.series : [], albumTracks: L.albumTracks, artistAlbums: L.artistAlbums,
      collectionItems, cast, crew, studios, studioCards, chapters: showsSection('chapters') ? it.Chapters : undefined,
      similar, reviews: L.reviews, seerr: m.seerr, tracks: t === 'Playlist' ? playlistTracks : L.albumTracks,
      playlistItems: t === 'BoxSet' && !showsSection('playlistOrder') ? [] : L.playlistItems,
      collectionSort: L.collectionSort, collectionPlaylistLoading: L.collectionPlaylistLoading, contentW, playlistBar,
      seasonMarker: (season) => (s.showSeerrAvailabilityBadges !== false ? (m.seerr.seasonMarkers || NO_SEASONS).get(season.IndexNumber) : null),
      bookSeriesItem: m.bookSeries, books: m.bookSeries ? m.bookSeries.Members : [], animeSeries: anime && anime.series,
    }
    const tabs = tabsFor(tabData)
    const expanded = s.detailExpandedTabs !== false
    const forceFirst = t === 'MusicAlbum' || t === 'Playlist'
    const valid = m.activeTab && tabs.some((x) => x.id === m.activeTab) ? m.activeTab : null
    const active = valid || (expanded || forceFirst ? (tabs[0] && tabs[0].id) || '' : '')
    // Seerr's download bars sit 16px under the hero and push the tabs down.
    const bars = downloadsLayout(m.seerr && m.seerr.downloads)
    setDl({ y: laid.heroBottom + 16, bars })
    const tabsY = laid.heroBottom + (bars.h ? 16 + bars.h : 0) + 23
    setTb({ tabs, x: left, y: tabsY, active, maxW: contentW })
    const contentTop = tabsY + 63 + 12
    const open = active ? tabContent(active, tabData) : { kind: 'none', cells: [], headings: [], height: 0 }
    setTc({ kind: open.kind, cells: open.cells || [], headings: open.headings || [], info: open.info || null, seerr: open.seerr || null, y: contentTop })
    m.contentH = (tabs.length ? contentTop + Math.max(320, open.height) : laid.heroBottom) + PAD_BOTTOM
  }
  const tabContent = (id, d) => {
    if (id === 'details') {
      return { kind: 'details', info: { item: m.item, mediaSource: d.mediaSource, audio: m.tracks.audio, subtitle: m.tracks.subtitle, w: d.contentW }, height: 600 }
    }
    if (id === 'seerr') return { kind: 'seerr', seerr: { seerr: m.seerr, w: d.contentW }, height: 600 }
    const laid = layoutTab(id, d)
    return { kind: 'cells', cells: laid.cells, headings: laid.headings, height: laid.height }
  }
  const upNextCardFor = (ep, s) => {
    const code = ep.ParentIndexNumber != null && ep.IndexNumber != null ? `S${ep.ParentIndexNumber}:E${ep.IndexNumber} - ` : ''
    const label = `${$L('Next Up')} - ${code}${ep.Name || ''}`
    const overview = ep.Overview && !hidesMediaDescription(ep, s) ? ep.Overview : ''
    const lines = overview ? Math.min(3, wrapLines(overview, 17, 'regular', 328).length) : 0
    const progress = ((ep.UserData && ep.UserData.PlayedPercentage) || 0) / 100
    const leftTicks = (ep.RunTimeTicks || 0) - ((ep.UserData && ep.UserData.PlaybackPositionTicks) || 0)
    const remaining = leftTicks > 0 ? $L('{time} remaining').replace('{time}', formatDuration(leftTicks)) : ''
    const footH = remaining ? 33 : progress > 0 ? 6 : 0
    const ovH = lines * 22.95
    const remW = remaining ? textWidth(remaining, 16) : 0
    return {
      label,
      overview,
      overviewFont: fontFor(overview),
      overviewY: 63,
      footY: 63 + ovH + 17,
      remaining,
      remainingX: 24 + 328 - remW,
      barW: 328 - (remaining ? 17 + remW : 0),
      progress: Math.min(1, progress),
      thumb: ep.ImageTags && ep.ImageTags.Primary ? getImageUrl(m.srv, ep.Id, 'Primary', { maxWidth: 400, quality: 80 }) : '',
      h: 1 + 62 + ovH + 17 + footH + 20 + 1,
    }
  }
  const onLogo = (dim) => {
    if (!m.logo || !dim || !dim.w) return
    m.logo.w = dim.w
    m.logo.h = dim.h
    paintSoon()
  }
  const onLogoError = () => {
    if (!m.logo) return
    m.logo.failed = true
    paintSoon()
  }

  const isActive = () => (page ? page.active() : true)
  const cellsRef = () => {
    const kind = untrack(tc).kind
    return kind === 'details' ? 'fileinfo' : kind === 'seerr' ? 'seerrtab' : 'cells'
  }
  const focusZone = (z) => {
    setZone(z)
    if (untrack(style) !== 'v2') {
      if (styled && styled.setFocus) styled.setFocus()
      return
    }
    const ref = refs[{ overview: 'overview', actions: 'actions', upnext: 'upnext', tabs: 'tabs', cells: cellsRef() }[z]]
    if (ref) ref.setFocus()
    scrollToZone()
  }
  const scrollToZone = (cell) => {
    const z = untrack(zone)
    let item = null
    let container = null
    if (z === 'actions') item = container = { y: untrack(act).y, h: 75 }
    else if (z === 'overview') item = { y: untrack(ov).y, h: ovHeight() }
    else if (z === 'upnext') item = container = { y: untrack(un).y, h: untrack(un).card ? untrack(un).card.h : 0 }
    else if (z === 'tabs') item = container = { y: untrack(tb).y, h: 63 }
    else if (z === 'cells') {
      const c = cell || m.focusedCell
      if (!c) return
      const box = untrack(tc)
      // A media card takes focus on its artwork, so the labels under it don't count.
      item = { y: box.y + c.y, h: c.kind === 'card' ? c.cardH : c.h }
      const group = box.cells.filter((x) => x.idx >= 0 && (x.section == null || x.section === c.section))
      if (group.length) {
        const top = Math.min(...group.map((x) => x.y))
        const bottom = Math.max(...group.map((x) => x.y + x.h))
        container = { y: box.y + top, h: bottom - top }
      }
    }
    if (!item) return
    setScroll(scrollFor(untrack(scroll), m.contentH || VIEW_H, item, container))
  }
  const ovHeight = () => {
    const box = untrack(ov).box
    return box ? overviewHeight(box, untrack(overviewExpanded)) : 0
  }
  // Up from the top of the page scrolls back to the top first, and only then goes to a top nav bar.
  const upFromTop = () => {
    if (untrack(scroll) > 1) {
      setScroll(0)
      return true
    }
    if (!navOnLeft()) focusNav()
    return true
  }

  const onActionFocus = () => {
    if (untrack(zone) === 'actions') scrollToZone()
  }
  const onActionsEdge = (dir) => {
    if (dir === 'left' && navOnLeft()) focusNav()
    else if (dir === 'right' && untrack(un).show) focusZone('upnext')
  }
  const onActionLong = (id) => {
    m.advancedResume = id === 'resume'
    modal('openTracks', 'advanced', { item: m.item, tracks: m.tracks })
  }
  const onOverviewToggle = () => {
    setOverviewExpanded(!untrack(overviewExpanded))
    paint()
  }
  const onUpNextSelect = () => {
    if (m.nextUp) open(m.nextUp)
  }
  const openTab = (id) => {
    if (untrack(tb).active === id) return
    m.activeTab = id
    m.focusedCell = null
    if (refs.cells) refs.cells.resetCur()
    paint()
  }
  const onTabFocus = (id) => {
    if (settings().detailExpandedTabs === false) return
    openTab(id)
  }
  const onTabEnter = (id) => {
    if (settings().detailExpandedTabs !== false) return openTab(id)
    m.activeTab = untrack(tb).active === id ? '' : id
    paint()
  }
  const onCellFocus = (cell) => {
    m.focusedCell = cell
    scrollToZone(cell)
    const L = m.lists
    const active = untrack(tb).active
    if (active === 'collectionPlaylist' && cell.kind === 'track' && cell.idx >= L.playlistItems.length - 5) loadMoreCollectionItems(m.collection, m.ctx)
    if (active === 'items' && m.collection.titles && cell.idx >= L.collectionItems.length - 8) loadMoreTitles()
  }
  const loadMoreTitles = async () => {
    const titles = m.collection.titles
    if (!titles || !titles.more || titles.loading) return
    const pageOf = await readCollectionTitles(titles, m.item.Id, m.item)
    if (pageOf.length) m.ctx.set({ collectionItems: m.lists.collectionItems.concat(pageOf) })
  }
  const onCellsEdge = (dir) => {
    if (dir === 'up') {
      focusZone('tabs')
      if (refs.tabs) refs.tabs.select(untrack(tb).active)
    } else if (dir === 'left' && navOnLeft()) focusNav()
  }
  const onCellSelect = (cell) => {
    const it = cell.item
    const t = m.item.Type
    // A Seerr-only title's cast are TMDB people, who open on Seerr's person page.
    if (cell.kind === 'person' && isSeerrOnlyItem(m.item)) return router.to(`/seerr/person/${it.Id}`, { name: it.Name })
    if (cell.kind === 'person') return router.to(`/person/${it.Id}`)
    if (cell.kind === 'chapter' && !it) return playItem(m.item, false, { ...streamPicks(), startPositionTicks: cell.ticks, resume: true })
    if (cell.kind === 'chapter') return playItem(it, false)
    // A studio opens every library filtered to that studio.
    if (cell.kind === 'studio') return router.to('/library/all', { studioName: cell.studioName })
    if (cell.kind === 'review') return modal('openReview', cell.review)
    if (cell.kind === 'sort') return modal('openCollectionSort', m.lists.collectionSort, (opt) => chooseCollectionSort(m.collection, opt, m.ctx))
    if (cell.kind === 'pill' || cell.kind === 'clear') return onPill(cell.id)
    if (cell.kind === 'track') {
      if (t === 'BoxSet') return playFromList(untrack(tc).cells.filter((c) => c.kind === 'track').map((c) => c.item), it)
      return playFromList(t === 'Playlist' ? m.shownTracks : m.lists.albumTracks, it)
    }
    if (it && it._seerr && it._seerrRaw) return onSeerrCardSelect(it)
    if (cell.kind === 'episode' && t === 'Episode' && it.Id === m.item.Id) return playOwn(shouldResumeTarget(it))
    if (it) open(it)
  }

  const runAction = (id) => {
    const it = m.item
    if (!it) return
    if (id === 'resume') playOwn(true)
    else if (id === 'play') play()
    else if (id === 'shuffle') shuffle()
    else if (id === 'goToSeries' && it.Type === 'Book') {
      loadBookSeries(m.api, it)
        .then((series) => series && openBookSeries(router, series))
        .catch(() => {})
    } else if (id === 'goToSeries') router.to(`/details/${it.SeriesId}`, detailsData(props.server))
    else if (id === 'version' || id === 'audio' || id === 'subtitles')
      modal('openTracks', id, { item: it, tracks: m.tracks, preferExternal: settings().preferExternalSubtitles === true })
    else if (id === 'trailer') modal('openTrailer', it)
    else if (id === 'watched' || id === 'favorite') toggle(id)
    else if (id === 'personalRating') modal('openRating', it, normalizeRatingStyle(settings().personalRatingStyle))
    else if (id === 'playlist') modal('openAddTo', 'playlist', it)
    else if (id === 'collection') modal('openAddTo', 'collection', it)
    else if (id === 'deleteFiles') modal('openDelete', it)
    else if (id === 'artwork') modal('openArtwork', it)
    else if (id === 'admin') modal('openIdentify', it)
    else if (id === 'more') modal('openMore', m.behind)
    else if (id === 'personDisplay') modal('openPersonDisplay')
    else if (id === 'keepAsComplete') {
      keepAsComplete(it.Id).then(
        () => toast($L('Marked as complete')),
        () => toast($L('Unable to mark as complete')),
      )
    } else if (id.indexOf('seerr') === 0) modal('openSeerr', id, m.seerr, it)
  }
  // The modals hand back what the viewer picked.
  const onTracksPicked = (kind, i) => {
    if (kind === 'version') {
      if (i !== m.tracks.version) {
        const ms = m.item.MediaSources[i]
        const audios = ((ms && ms.MediaStreams) || []).filter((x) => x.Type === 'Audio')
        const def = audios.findIndex((x) => x.Index === ms.DefaultAudioStreamIndex)
        m.tracks = { version: i, audio: Math.max(0, def), subtitle: m.tracks.subtitle }
        m.chosen = { audio: false, subtitle: false }
      }
    } else if (kind === 'audio') {
      m.tracks = { ...m.tracks, audio: i }
      m.chosen.audio = true
    } else {
      m.tracks = { ...m.tracks, subtitle: i }
      m.chosen.subtitle = true
    }
    paint()
  }
  // What the action circles' glass blurs: the backdrop, blurred by the server (10px at 1920 is 3
  // at 640), under the page's shade and scrim. Only Jellyfin and Emby blur on request.
  const glassFor = (it, back, shade, scrimUrl) => {
    const type = getServerType()
    const backId = getBackdropId(it)
    if (!back || it._externalBackdropUrl || !backId || (type !== 'jellyfin' && type !== 'emby')) return null
    return { src: `${getImageUrl(m.srv, backId, 'Backdrop', { maxWidth: 640, quality: 90, tag: backdropTag(it) })}&blur=3`, shade, scrim: scrimUrl }
  }
  // A playlist's page has no nav.
  const showNav = () => {
    if (!props.quickLook) store.navVisible = !(m.item && m.item.Type === 'Playlist')
  }
  // Identify, artwork and Seerr's sheets change what this page shows, so it loads that again.
  // Identify can move the item to a new id, which opens as its own page.
  const onItemRefreshed = (newId) => {
    if (newId && newId !== props.id) return router.to(`/details/${newId}`, detailsData(props.server))
    start()
  }
  const onSeerrRefresh = async () => {
    const it = m.item
    const gen = m.gen
    if (!it) return
    const seerr = await loadSeerrOverlay(it, sectionVisibility(settings().hiddenDetailSectionsTv))
      .then(withDownloads)
      .catch(() => null)
    if (gen !== m.gen) return
    if (seerr) {
      m.seerr = isSeerrOnlyItem(it) ? seerrOnlyOverlay(seerr) : seerr
      paint()
    }
    armSeerrPoll()
  }
  // Get a different release hides while its removal runs, and focus goes back to the start of the
  // row. The reload after it brings the row up to date.
  const onSeerrSwapping = () => {
    m.seerr = { ...m.seerr, showsSwapRelease: false, showsManageSlot: !!m.seerr.showsManage }
    paint()
    if (untrack(style) === 'v2' && refs.actions) refs.actions.selectFirst()
  }
  // A title on its way is fetched again while its page is open, until it lands. Only the details
  // and bars change on a tick, unless its status or requests moved, which works the whole overlay
  // out again.
  const armSeerrPoll = () => {
    clearTimeout(seerrPoll)
    const ms = m.seerr && m.seerr.pollMs
    if (!ms) return
    const gen = m.gen
    seerrPoll = setTimeout(async () => {
      if (gen !== m.gen) return
      if (appHidden() || !isActive() || (page && getActivePage() !== page)) return armSeerrPoll()
      const next = await pollSeerr(m.seerr)
      if (gen !== m.gen) return
      if (next === 'reload') return onSeerrRefresh()
      if (next) {
        m.seerr = next
        paint()
      }
      armSeerrPoll()
    }, ms)
  }
  const onPill = (id) => {
    const pl = m.pl
    const apply = (patch) => {
      Object.assign(pl, patch)
      if (patch.sortBy === PLAYLIST_SORT_RANDOM) pl.seed = Date.now()
      paint()
    }
    if (id === 'sort') modal('openPlaylistSort', { sortBy: pl.sortBy, sortDirection: pl.sortDirection }, apply)
    else if (id === 'filter') {
      const types = []
      m.lists.playlistItems.forEach((x) => {
        const ty = x.MediaType || x.Type
        if (ty && types.indexOf(ty) < 0) types.push(ty)
      })
      modal('openPlaylistFilter', { playedFilter: pl.playedFilter, favoriteOnly: pl.favoriteOnly, mediaTypeFilter: pl.mediaTypeFilter }, types, apply)
    } else if (id === 'reset') {
      m.pl = { sortBy: PLAYLIST_SORT_ORDER, sortDirection: SORT_DIR_ASC, playedFilter: PLAYED_ALL, favoriteOnly: false, mediaTypeFilter: null, seed: Date.now() }
      paint()
      if (refs.cells) refs.cells.setCur(0)
    }
  }
  // A held card or row opens its menu, with what this page lets it do: a collection's titles can
  // leave it, and a playlist's entries can leave or move.
  const onCellLong = (cell) => {
    const it = cell.item
    if (!it || it._seerr) return
    const user = store && store.user
    const isAdmin = !!(user && user.Policy && user.Policy.IsAdministrator)
    const t = m.item.Type
    let playlist = null
    if (t === 'Playlist' && cell.kind === 'track') {
      const list = m.shownTracks
      const at = list.indexOf(it)
      playlist = { canManage: list.every((x) => x.PlaylistItemId), canRemove: true, first: at <= 0, last: at >= list.length - 1 }
    }
    modal('openItemMenu', it, { isAdmin, playlist, collection: t === 'BoxSet' && cell.kind === 'card' ? m.item : null })
  }
  // A menu's Play opens the title under the player. A playlist's own rows play where they are.
  const playCard = (it) => {
    if (m.item && m.item.Type === 'Playlist') return playItem(it, shouldResumeTarget(it))
    const [path, data] = playRoute(it)
    router.to(path, it._serverUrl ? data : { ...data, ...detailsData(props.server) })
  }
  const removeCard = async (it) => {
    const parent = m.item
    if (parent.Type === 'BoxSet') {
      await m.api.removeFromCollection(parent.Id, [it.Id])
      m.ctx.set({ collectionItems: m.lists.collectionItems.filter((x) => x.Id !== it.Id), collectionMembers: m.lists.collectionMembers.filter((x) => x.Id !== it.Id) })
    } else if (parent.Type === 'Playlist' && it.PlaylistItemId) {
      await m.api.removeFromPlaylist(parent.Id, [it.PlaylistItemId])
      m.ctx.set({ playlistItems: m.lists.playlistItems.filter((x) => x.PlaylistItemId !== it.PlaylistItemId) })
      toast($L('Removed from playlist'))
    }
  }
  // The entry goes at once and comes back if the server refuses.
  const removePlaylistEntry = async (it) => {
    const before = m.lists.playlistItems
    if (!it || !it.PlaylistItemId) return
    m.ctx.set({ playlistItems: before.filter((x) => x.PlaylistItemId !== it.PlaylistItemId) })
    try {
      await m.api.removeFromPlaylist(m.item.Id, [it.PlaylistItemId])
      toast($L('Removed from playlist'))
    } catch (e) {
      m.ctx.set({ playlistItems: before })
    }
  }
  const moveCard = async (it, dir) => {
    const list = m.lists.playlistItems.slice()
    const from = list.indexOf(it)
    const to = from + dir
    if (from < 0 || to < 0 || to >= list.length) return
    list.splice(from, 1)
    list.splice(to, 0, it)
    const before = m.lists.playlistItems
    m.ctx.set({ playlistItems: list })
    try {
      await m.api.movePlaylistItem(m.item.Id, it.PlaylistItemId, to)
    } catch (e) {
      m.ctx.set({ playlistItems: before })
    }
  }
  const onSeerrCardSelect = (card) => {
    const raw = card && card._seerrRaw
    if (raw) router.to(`/seerr/item/${raw.mediaType}/${raw.mediaId}`)
  }
  // The Seerr tab's chip lists the title's genres, networks and tags, and its banner opens the
  // collection.
  const onSeerrPiece = (kind, data) => {
    const sr = m.seerr
    if (kind === 'collection' && data) return router.to(`/seerr/collection/${data.id}`)
    if (kind !== 'chips' || !sr.details) return
    modal('openSeerrTags', sr.details, sr.mediaType, (pick) => {
      const [what, id] = pick.split(':')
      router.to(`/seerr/browse/${what}/${what === 'network' ? 'tv' : sr.mediaType}/${id}`)
    })
  }
  const playTrailerChoice = (choice) => {
    if (!choice) return
    if (choice.local) playItem(choice.local, false)
    else router.to(`/trailer/${choice.videoId}`, { videoId: choice.videoId, title: m.item.Name || '' })
  }
  const onDeleted = () => {
    if (props.quickLook) return props.onQuickLookClose && props.onQuickLookClose()
    router.back()
  }
  // Quick Look's full page: in the drawer's place with `replace`, or over it, as a season opens.
  const openFullPage = (item, replace) => {
    const seerr = item._seerrMediaId != null ? { type: item._seerrMediaType, id: item._seerrMediaId } : null
    if (props.onQuickLookFull) props.onQuickLookFull({ id: item.Id, type: item.Type, replace: Boolean(replace), seerr })
  }
  const toggle = async (id) => {
    const it = m.item
    const ud = it.UserData || {}
    try {
      if (id === 'favorite') await m.api.setFavorite(it.Id, !ud.IsFavorite)
      else await m.api.setWatched(it.Id, !ud.Played)
    } catch (e) {
      return
    }
    const patch = id === 'favorite' ? { IsFavorite: !ud.IsFavorite } : { Played: !ud.Played, PlayedPercentage: ud.Played ? 0 : 100 }
    m.item = { ...m.item, UserData: { ...ud, ...patch } }
    paint()
    if (id === 'favorite') return
    reloadEpisodes(it)
    browseRefresh({})
  }
  // Marking a whole series or season reaches every episode under it, which the server doesn't report
  // one by one, so the page reads its seasons, episodes and next up again.
  const reloadEpisodes = async (it) => {
    if (it.Type !== 'Series' && it.Type !== 'Season') return
    const ctx = m.ctx
    const turn = (m.reloads = (m.reloads || 0) + 1)
    const series = it.Type === 'Series'
    const [seasons, episodes, seriesEpisodes, nextUp] = await Promise.all([
      series ? m.api.getSeasons(it.Id).catch(() => null) : null,
      series ? null : m.api.getEpisodes(it.SeriesId, it.Id).catch(() => null),
      series && m.lists.seriesEpisodes.length ? m.api.getEpisodes(it.Id).catch(() => null) : null,
      series ? m.api.getNextUp(1, it.Id).catch(() => null) : null,
    ])
    // A later toggle's read wins.
    if (turn !== m.reloads) return
    const read = [seasons, episodes, seriesEpisodes, nextUp].filter(Boolean)
    userDataSync.recordFromServer(read.reduce((items, r) => items.concat(r.Items || []), []))
    const keep = (r) => withoutBlockedItems(r.Items || [], it.OfficialRating)
    const patch = {}
    if (seasons) patch.seasons = keep(seasons)
    if (episodes) patch.episodes = keep(episodes)
    if (seriesEpisodes) patch.seriesEpisodes = keep(seriesEpisodes)
    if (nextUp) patch.nextUp = nextUp.Items || []
    ctx.set(patch)
  }
  const open = (it) => {
    const kind = { Person: 'person', MusicAlbum: 'album', MusicArtist: 'artist' }[it.Type] || 'details'
    // What this page lists lives on its server.
    router.to(`/${kind}/${it.Id}`, kind === 'details' ? detailsData(it._serverUrl ? it : props.server) : {})
  }
  const playItem = (target, resume, extra) => {
    const ticks = resume ? (target.UserData && target.UserData.PlaybackPositionTicks) || 0 : 0
    router.to(`/player/${target.Id}`, { startPositionTicks: ticks, resume: !!resume, ...(extra || {}), ...detailsData(props.server) })
  }
  // The version and the tracks picked here, in the player's shape. A track only goes along once
  // it was picked here, so the player's language settings decide until then.
  const streamPicks = () => {
    const it = m.item
    const supports = it.MediaType === 'Video' && it.MediaSources && it.MediaSources.length && it.MediaSources[0].Type !== 'Placeholder'
    if (!supports) return {}
    const ms = it.MediaSources[m.tracks.version] || it.MediaSources[0]
    const audios = (ms.MediaStreams || []).filter((x) => x.Type === 'Audio')
    const subs = (ms.MediaStreams || []).filter((x) => x.Type === 'Subtitle')
    const out = { mediaSourceId: ms.Id }
    if (m.chosen.audio && audios[m.tracks.audio]) out.audioStreamIndex = audios[m.tracks.audio].Index
    if (m.chosen.subtitle) out.subtitleStreamIndex = m.tracks.subtitle >= 0 && subs[m.tracks.subtitle] ? subs[m.tracks.subtitle].Index : -1
    return out
  }
  const playOwn = async (resume) => {
    const it = m.item
    const picks = streamPicks()
    const parts = it.PartCount > 1 ? await m.api.getAdditionalParts(picks.mediaSourceId || it.Id).catch(() => null) : null
    const partIds = ((parts && parts.Items) || []).map((p) => p.Id)
    const prerolls = resume ? [] : await fetchPrerolls(m.api, it, all()).catch(() => [])
    if (prerolls.length) {
      playItem(prerolls[0], false, { queue: prerolls.map((p) => p.Id).concat(it.Id, partIds), prerolls: prerolls.length })
    } else {
      playItem(it, resume, partIds.length ? { ...picks, queue: [it.Id].concat(partIds) } : picks)
    }
  }
  const play = async () => {
    const it = m.item
    const L = m.lists
    const t = it.Type
    if (t === 'Series') {
      const eps = await m.api.getEpisodes(it.Id).catch(() => null)
      const target = pickEpisodePlayTarget((eps && eps.Items) || [], L.nextUp[0] || null)
      if (target) playItem(target, shouldResumeTarget(target))
      else if (L.seasons.length) open(L.seasons[0])
    } else if (t === 'Season') {
      const target = pickEpisodePlayTarget(L.episodes) || L.episodes[0]
      if (target) playItem(target, shouldResumeTarget(target))
    } else if (t === 'BoxSet') {
      const queue = orderItemsByIds(collectionQueue(L.collectionMembers), m.collection.index || [])
      const target = collectionPlayTarget(queue)
      if (target) playItem(target, shouldResumeTarget(target), { queue: queue.map((x) => x.Id) })
    } else if (t === 'Playlist') {
      playFromList(m.shownTracks, m.shownTracks[0])
    } else if (t === 'MusicAlbum') {
      playFromList(L.albumTracks, L.albumTracks[0])
    } else if (t === 'Book' && bookReader(it)) {
      // shortcut: a newer format the TV can't open still goes to the reader, without the Books page's explanation dialog.
      router.to(`/read/${it.Id}`)
    } else {
      playOwn(false)
    }
  }
  // A list plays on from the picked entry, with only what the same player can take.
  const playFromList = (list, entry) => {
    if (!entry) return
    const audio = entry.MediaType === 'Audio'
    const queue = list.filter((x) => (x.MediaType === 'Audio') === audio).map((x) => x.Id)
    playItem(entry, false, { queue: queue.slice(queue.indexOf(entry.Id)) })
  }
  const shuffle = async () => {
    const it = m.item
    const L = m.lists
    const t = it.Type
    // Silo shuffles a show, season or collection itself, playing everything once before any repeats,
    // and the queue grows as it goes. Anything it won't shuffle is shuffled here.
    if (t === 'Series' || t === 'Season' || t === 'BoxSet') {
      const served = await startServerShuffle(m.api, it).catch(() => null)
      if (served && served.length) {
        return playItem(served[0], false, { queue: served.map((x) => x.Id), serverShuffle: served[0]._serverShuffle })
      }
    }
    let pool = []
    if (t === 'Season' && L.episodes.length) pool = L.episodes
    else if (t === 'Series' || t === 'Season') {
      const res = await m.api
        .getItems({ ParentId: it.Id, IncludeItemTypes: 'Episode', Recursive: true, Fields: 'MediaSources,MediaStreams', Limit: 500 })
        .catch(() => null)
      pool = (res && res.Items) || []
    } else if (t === 'BoxSet') pool = collectionQueue(L.collectionMembers)
    else if (t === 'Playlist') pool = m.shownTracks
    else if (t === 'MusicAlbum') pool = L.albumTracks
    else return playItem(it, false)
    const order = shuffled(pool.filter((x) => x && x.Id))
    if (order.length) playItem(order[0], false, { queue: order.map((x) => x.Id) })
  }

  // The page's handle, which the other styles and DetailModals call.
  const dt = {
    ctx: () => m.ctx,
    collection: () => m.collection,
    // A style that lays out its own action row says what More Actions holds.
    setBehind: (b) => (m.behind = b),
    playFromList,
    tokens: () => untrack(tokens),
    upFromTop,
    runAction,
    onMoreAction: runAction,
    onActionsEdge,
    onActionLong,
    onCellSelect,
    onCellLong,
    loadMoreTitles,
    open,
    playItem,
    playCard,
    removeCard,
    removePlaylistEntry,
    moveCard,
    onSeerrCardSelect,
    onSeerrPiece,
    // A Seerr season card opens the request sheet with just that season ticked.
    onSeerrSeasonSelect: (season) => modal('openSeerr', 'seerrRequestSeason', m.seerr, m.item, season),
    onSeerrWatchlist: (onList) => {
      m.seerr = { ...m.seerr, onWatchlist: onList }
      paint()
    },
    onSeerrRefresh,
    onSeerrSwapping,
    onItemRefreshed,
    onTracksPicked,
    onSettingsChanged: paint,
    onModalClosed: () => focusZone(untrack(zone)),
    onSubtitleAdded: (item, position) => {
      m.item = item
      m.tracks = { ...m.tracks, subtitle: position }
      m.chosen.subtitle = true
      paint()
    },
    onAdvancedPick: (bitrate) => playItem(m.item, m.advancedResume, { ...streamPicks(), forceBitrate: bitrate, forceTranscode: true }),
    playTrailerChoice,
    onRated: (patch) => {
      m.item = { ...m.item, UserData: { ...m.item.UserData, ...patch } }
      paint()
    },
    onDeleted,
    openFullPage,
    onPill,
    // A style's own More menu, with the buttons its toolbar left out, and the stage it's centered in
    // when the style scales one (OverflowMenu's frame).
    openMore: (buttons, frame) => modal('openMore', buttons, frame),
  }

  onMount(() => {
    const unsub = userDataSync.subscribe(synced)
    const unsubIncomplete = onIncompleteRecordings(() => m.item && paint())
    onCleanup(() => {
      unsub()
      unsubIncomplete()
    })
    createEffect(on(() => props.id, start))
  })
  // A setting changed here or synced from the server, or a theme's face landed, which measures
  // differently: lay the page out again.
  createEffect(on(() => store.settingsVersion, () => m.item && paint(), { defer: true }))
  // The nav comes back each time this page is on top again, hidden only over a playlist.
  if (page) {
    createEffect(
      on(page.active, (on) => {
        if (!on) return
        store.navSection = ''
        showNav()
      }),
    )
  }
  onCleanup(() => {
    if (m.item && m.item.Type === 'Playlist') store.navVisible = true
    m.gen++
    clearTimeout(settleTimer)
    clearTimeout(seerrPoll)
    clearTimeout(paintTimer)
  })

  const v2 = () => style() === 'v2'
  const shown = () => (v2() && !loading() && !blocked() ? 1 : 0)
  return (
    <view
      width={1920}
      height={1080}
      forwardFocus={() => {
        if (!m.item) return false
        focusZone(untrack(zone))
        return true
      }}
      onUp={() => {
        if (!v2()) return upFromTop()
        const z = zone()
        if (z === 'cells') {
          onCellsEdge('up')
          return true
        }
        if (z === 'tabs') {
          focusZone('actions')
          return true
        }
        if (z === 'actions' && ov().show && ov().box && ov().box.canToggle) {
          focusZone('overview')
          return true
        }
        return upFromTop()
      }}
      onDown={() => {
        if (!v2()) return true
        const z = zone()
        if (z === 'overview') {
          focusZone('actions')
          return true
        }
        if ((z === 'actions' || z === 'upnext') && tb().tabs.length) {
          focusZone('tabs')
          if (refs.tabs) refs.tabs.select(tb().active || tb().tabs[0].id)
          return true
        }
        if (z === 'tabs') {
          const tab = refs.tabs && refs.tabs.current()
          if (!tab) return true
          if (tb().active !== tab.id) {
            m.activeTab = tab.id
            paint()
          }
          const cells = refs[cellsRef()]
          if (cells && cells.entry) cells.setCur(cells.entry())
          focusZone('cells')
        }
        return true
      }}
      onLeft={() => {
        if (zone() === 'upnext') {
          focusZone('actions')
          return true
        }
        return navOnLeft() && focusNav()
      }}
      onBack={() => {
        if (overviewExpanded()) {
          setOverviewExpanded(false)
          paint()
          return true
        }
        if (props.quickLook && props.onQuickLookClose) {
          props.onQuickLookClose()
          return true
        }
        return false
      }}
    >
      <view width={1920} height={1080} color="#0b0d10ff" alpha={props.quickLook ? 0 : 1} />
      <view
        alpha={backdrop() ? 1 : 0}
        width={1920}
        height={1080}
        src={backdrop() || undefined}
        textureOptions={{ resizeMode: { type: 'cover' } }}
      />
      <view width={1920} height={1080} color={backdropShade()} />
      <view alpha={scrim() ? 1 : 0} width={1920} height={1080} src={scrim() || undefined} />

      <view>
        <For each={skeleton()}>
          {(sk) =>
            sk.top ? (
              <view x={sk.x} y={sk.y} width={sk.w} height={sk.h} colorTop={sk.top} colorBottom={sk.bottom} />
            ) : sk.left ? (
              <view x={sk.x} y={sk.y} width={sk.w} height={sk.h} colorLeft={sk.left} colorRight={sk.right} />
            ) : (
              <view x={sk.x} y={sk.y} width={sk.w} height={sk.h} borderRadius={sk.r} color={sk.color} />
            )
          }
        </For>
      </view>

      <view alpha={blocked() ? 1 : 0} x={936} y={489} width={48} height={48} src="icons/d/m_lock.webp" color="#ffffff8a" />
      <text alpha={blocked() ? 1 : 0} x={960} y={553} mountX={0.5} fontFamily={fontFor($L("This isn't available"))} fontSize={19} color="#ffffff8a">
        {$L("This isn't available")}
      </text>
      <view
        x={0}
        y={0}
        width={1}
        height={1}
        alpha={0.001}
        src={logoProbe() || undefined}
        onEvent={{
          loaded: (_, e) => onLogo(e && e.dimensions),
          failed: () => onLogoError(),
        }}
      />

      <view y={-scroll()} transition={SCROLL} alpha={shown()} width={1920} height={PAGE_H}>
        <view>
          <For each={rects.keys()}>
            {(k) => (
              <view
                x={rects.at(k).x}
                y={rects.at(k).y}
                width={rects.at(k).w}
                height={rects.at(k).h}
                borderRadius={rects.at(k).r}
                color={rects.at(k).color}
                border={rects.at(k).bw ? { width: rects.at(k).bw, color: hex(rects.at(k).bc) } : undefined}
              />
            )}
          </For>
        </view>
        <view>
          <For each={imgs.keys()}>
            {(k) => (
              <view
                x={imgs.at(k).x}
                y={imgs.at(k).y}
                width={imgs.at(k).w}
                height={imgs.at(k).h}
                src={imgs.at(k).src || undefined}
                color={imgs.at(k).color}
                borderRadius={imgs.at(k).r}
                textureOptions={{ resizeMode: { type: imgs.at(k).fit || 'cover' } }}
              />
            )}
          </For>
        </view>
        <view>
          <For each={texts.keys()}>
            {(k) => (
              <text
                x={texts.at(k).x}
                y={texts.at(k).y}
                fontFamily={texts.at(k).font}
                fontStyle={texts.at(k).rich ? 'italic' : 'normal'}
                fontSize={texts.at(k).size}
                color={texts.at(k).color}
                lineHeight={texts.at(k).lh || undefined}
                letterSpacing={texts.at(k).ls || 0}
                maxWidth={texts.at(k).maxw || undefined}
                maxLines={texts.at(k).maxlines || undefined}
                textShadow={texts.at(k).shadow || undefined}
              >
                {plain(texts.at(k))}
              </text>
            )}
          </For>
        </view>

        <Overview
          ref={(n) => (refs.overview = n)}
          x={ov().x}
          y={ov().y}
          alpha={ov().show ? 1 : 0}
          text={ov().text}
          font={ov().font}
          box={ov().box}
          expanded={overviewExpanded()}
          tokens={tokens()}
          onOverviewToggle={onOverviewToggle}
        />
        <ActionButtons
          ref={(n) => (refs.actions = n)}
          x={act().x}
          y={act().y}
          w={act().w}
          buttons={act().buttons}
          held={act().held}
          tokens={tokens()}
          glass={act().glass}
          ox={act().x}
          oy={act().y - scroll()}
          onAction={runAction}
          onActionLong={onActionLong}
          onActionFocus={onActionFocus}
          onActionsEdge={onActionsEdge}
        />
        <SeerrStatusDownloads x={act().x} y={dl().y} bars={dl().bars} />
        <UpNextCard
          ref={(n) => (refs.upnext = n)}
          x={un().x}
          y={un().y}
          alpha={un().show ? 1 : 0}
          card={un().card}
          tokens={tokens()}
          onUpNextSelect={onUpNextSelect}
        />
        <TabBar
          ref={(n) => (refs.tabs = n)}
          x={tb().x}
          y={tb().y}
          tabs={tb().tabs}
          active={tb().active}
          maxW={tb().maxW}
          tokens={tokens()}
          onTabFocus={onTabFocus}
          onTabEnter={onTabEnter}
        />
        <view x={tb().x} y={tc().y}>
          <TabCells
            ref={(n) => (refs.cells = n)}
            alpha={tc().kind === 'cells' ? 1 : 0}
            cells={tc().kind === 'cells' ? tc().cells : []}
            headings={tc().kind === 'cells' ? tc().headings : []}
            viewTop={scroll() - tc().y}
            tokens={tokens()}
            onCellFocus={onCellFocus}
            onCellSelect={onCellSelect}
            onCellLong={onCellLong}
            onCellsEdge={onCellsEdge}
          />
          <FileInfo
            ref={(n) => (refs.fileinfo = n)}
            alpha={tc().kind === 'details' ? 1 : 0}
            info={tc().info}
            tokens={tokens()}
            onCellFocus={onCellFocus}
            onCellsEdge={onCellsEdge}
          />
          <SeerrTab
            ref={(n) => (refs.seerrtab = n)}
            alpha={tc().kind === 'seerr' ? 1 : 0}
            tab={tc().seerr}
            viewTop={scroll() - tc().y}
            tokens={tokens()}
            onCellFocus={onCellFocus}
            onCellsEdge={onCellsEdge}
            onSeerrPiece={onSeerrPiece}
            onSeerrCardSelect={onSeerrCardSelect}
          />
        </view>
      </view>

      <view>
        <Show when={!v2() && STYLES[style()]} keyed>
          {(Style) => (
            <Dynamic
              component={Style}
              ref={(h) => {
                styled = h
                // start() picks the style inside an effect, so the style mounts after start() drew
                // Modern's placeholders, and its own replace them here.
                if (untrack(loading) && !m.item && h && h.skeletonBoxes) setSkeleton(h.skeletonBoxes())
              }}
              page={dt}
              tokens={tokens()}
              quickLook={Boolean(props.quickLook)}
            />
          )}
        </Show>
      </view>

      <view>
        <Show when={MODALS}>
          <Dynamic component={MODALS} ref={(h) => (modals = h)} page={dt} tokens={tokens()} />
        </Show>
      </view>
    </view>
  )
}
