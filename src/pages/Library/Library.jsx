import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, on, onCleanup, onMount, untrack } from 'solid-js'
import Grid from '../../ui/components/Grid.jsx'
import Row from '../../ui/components/Row.jsx'
import Keyboard from '../../ui/components/Keyboard.jsx'
import Chrome from '../../ui/components/library/Chrome.jsx'
import LibraryPanel from '../../ui/components/library/LibraryPanel.jsx'
import LibraryTile from '../../ui/components/library/LibraryTile.jsx'
import FocusedInfo from '../../ui/components/library/FocusedInfo.jsx'
import BackdropLayer from '../../ui/components/shell/BackdropLayer.jsx'
import { Kept, keyed, pageTimers } from '../../ui/components/library/pageKit.js'
import { colorNum, libraryChrome } from '../../ui/components/library/libraryChrome.js'
import { focusMs, slideMs } from '../../ui/components/library/motion.js'
import { fitText, fontsReady, textWidth } from '../../ui/components/library/measure.js'
import { goHome } from '../../ui/components/library/goHome.js'
import { openNativeInput, usesNativeKeyboard } from '../../ui/components/account/nativeInput.js'
import { toCard } from '../../ui/models.js'
import { displayFont, fontFor, uiFont } from '../../ui/text.js'
import { activeThemeId, shadowColor, theme } from '../../ui/theme.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { isInside } from '../../app/PageStack.jsx'
import { activeElement } from '@solidtv/solid'
import { api, createApiForServer, getServerType, getServerUrl } from '../../services/jellyfinApi.js'
import * as connectionPool from '../../services/connectionPool.js'
import { detailsData } from '../../state/libraryRoutes.js'
import {
  PreferredCopies, copyKey, foldCopies, indexCopies, joinIndexedCopies, mergeFacetValues, mergedLibraryName, mergedLibraryType,
  mergedSearchText, mergedSortComparator, serverCountOf, titleMatchKeys,
} from '../../utils/mergedCopies.js'
import { createMergedReaders, mergedReadersDrained, takeMergedPage } from '../../utils/mergedBrowse.js'
import { readSharedTitles, readsEveryTitle } from '../../services/mergedTitleReads.js'
import { getFromStorage, saveToStorage } from '../../services/storage.js'
import { withoutBlockedItems } from '../../services/parentalControls.js'
import * as userDataSync from '../../services/userDataSync.js'
import { getImageUrl, getPrimaryImageId } from '../../utils/helpers.js'
import { showsVideoBadge, videoBadgeDuration } from '../../utils/videoCardBadge.js'
import { foldForSearch } from '../../utils/accentFolding.js'
import { libraryPosterSize, matchesStartLetter } from '../../utils/gridChrome.js'
import { NO_FILTERS, buildFilterParams, hasActiveFilters } from '../../utils/libraryFilters.js'
import { LIBRARY_GROUP_OPTIONS, groupByLabel, groupLibraryItems } from '../../utils/libraryGroupBy.js'
import {
  PLAYLIST_CATEGORIES, PLAYLIST_SAMPLE_SIZE, groupPlaylists, playlistCategory, playlistCategoryFromItems,
  playlistNeedsItemCheck, playlistSummaryCategory,
} from '../../utils/playlistGrouping.js'
import { alphabetApplies, librarySortKeys, orderByMyRating, savedSortOrder, sortField, sortLabel } from '../../utils/librarySorts.js'
import * as settings from '../../state/settings.js'
import { playQueue } from '../Music/music.js'
import { menuHold } from '../../ui/components/modals/menuHold.js'
import {
  DIRECTORY_TYPES, FACET_PAGE, FILTER_FIELDS, FOLDER_DETAIL_TYPES, IMAGE_TYPE_OPTIONS, MUSIC_CONTENT_TYPES, SERIES_STATUS_BY_KEY,
  cardSubtitle, displayPanelRows, excludeTypesFor, gridMetrics, groupPanelRows, itemTypesFor, playedLabel,
  sortPanelRows, statusFiltersFor,
} from './libraryModel.js'

// One library's grid (/library/:id), or one genre or studio across the libraries (/library/all
// with genreName or studioName, /genre/:libraryId/:genreId). Music, book, game and Live TV libraries
// have screens of their own, and a music library's screen opens this one with `musicView` ('albums'
// or 'songs') and a genre tile's `musicGenre`. `preview` draws it in the settings preview with
// `prefs` as its settings and its first card held as the focused one, leaving focus, the nav and the
// route alone. A photo page that holds it passes onViewPhoto, viewing, onLibraryItems and
// onLibraryPhotoCount, and gets { loadMore, focusItem } through ref.
const PAGE = 150
const neonOn = () => activeThemeId(settings.all()) === 'neon_pulse'
const NEON_TILE = {
  ring: { width: 3, color: 0xff2e92ff },
  glow: { color: shadowColor('#ff2e9259'), x: 0, y: 0, blur: 12, spread: 0 },
  subColor: '#00e5ff',
}
const FIELDS = 'SortName,ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,ProviderIds,UserData,Genres,Studios'
const FOLDER_FIELDS = 'PrimaryImageAspectRatio,SortName,Path,ChildCount,MediaSourceCount,ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,UserData'
const FOCUS_SETTLE_MS = 150
// A merged library orders the servers' pages by the dates the sort reads and searches the original titles.
const MERGED_FIELDS = ',DateCreated,DateLastMediaAdded,PremiereDate,OriginalTitle'
// How long the first page of a merged library waits on the signed-in server's titles before showing without them, so
// a slow read never holds the grid back. The copies still find their cards, only which server's copy leads may differ.
const PREFERRED_WAIT_MS = 1500
const GRID_INSET = 174
// The music grid's title for what it shows. Playlists and genres keep the library's name.
const MUSIC_TITLES = { albums: 'Albums', albumArtists: 'Album Artists', artists: 'Artists', songs: 'Songs' }

export default function Library(props) {
  const store = getStore()
  const later = pageTimers()
  const st = reactive({
    controls: [],
    texts: [],
    boxes: [],
    infoX: 87,
    infoY: -1,
    infoW: 1746,
    focusedItem: null,
    gridX: 87,
    viewTop: 316,
    gridW: 1746,
    viewH: 754,
    cols: 1,
    tileW: 0,
    tileH: 0,
    tileOpts: {},
    horizontal: false,
    cards: [],
    groupRows: [],
    rowsY: 0,
    loading: true,
    skeleton: [],
    emptyText: '',
    panel: '',
    panelTitle: '',
    panelRows: [],
    panelNarrow: false,
    keyboard: false,
    backdrop: '',
  })
  // Plain state the screen doesn't draw from.
  const my = {
    zone: 'chrome',
    stack: [],
    gen: 0,
    items: [],
    seen: {},
    fetched: 0,
    total: 0,
    blocked: 0,
    dirs: 0,
    query: '',
    categories: {},
    resolving: {},
    playlistTypes: PLAYLIST_CATEGORIES.slice(),
    open: null,
    facetLimit: FACET_PAGE,
    facetQuery: '',
    landed: false,
    group: null,
    rowFocus: 0,
    preferred: null,
    copyIndex: null,
    refocus: null,
  }
  let chromeRef = null
  let grid = null
  let panelRef = null
  let kb = null
  const rowRefs = {}
  const shuffleRouter = { $router: router }

  const rowsX = () => (st.gridX > 420 ? 420 : 0)
  const rowsH = () => {
    const last = st.groupRows[st.groupRows.length - 1]
    return last ? last.y + last.h : 0
  }
  const gridShown = () => st.cards.length > 0 && !st.groupRows.length
  // BackdropLayer stays mounted unless Hide Backdrops in Libraries is on, and its scrim covers the
  // page whether or not a picture is under it.
  const backdropLayer = createMemo(() => {
    const s = props.prefs || settings.all()
    return s.hideBackdropsInLibraries ? null : { blur: s.backdropBlurHome }
  })
  const texts = keyed(() => st.texts, (t) => t.k)
  const rows = keyed(() => st.groupRows, (r) => r.key)
  const boxes = keyed(() => st.boxes, (b) => b.k)
  const emptyFont = uiFont()

  const setup = async () => {
    const libId = props.libraryId || props.id
    const known = libId && libId !== 'all' ? (store.libraries || []).find((l) => l.Id === libId) : null
    // A library from another server (a genre or studio browsed there, or one the nav lists) reads through that server.
    const src = props.library || known
    my.api = src && src._serverUrl && src._serverAccessToken
      ? createApiForServer(src._serverUrl, src._serverAccessToken, src._serverUserId, src._serverType)
      : api
    my.server = (src && src._serverUrl) || getServerUrl()
    my.serverType = (src && src._serverType) || getServerType()
    // A merged library reads every server's libraries of its type as one.
    my.merged = (src && src._mergedType) || mergedLibraryType(libId)
    try {
      const merged = my.merged ? { Id: libId, Name: mergedLibraryName(my.merged), CollectionType: my.merged, _mergedType: my.merged } : null
      my.lib = known || merged || (src && src.Id ? src : null) || (libId && libId !== 'all' ? await my.api.getItem(libId) : null)
      my.genre = props.genreName || (props.genreId ? (await my.api.getItem(props.genreId)).Name : '')
    } catch (e) {
      console.error('[library] setup failed', e)
      my.lib = null
    }
    my.studio = props.studioName || ''
    my.musicView = props.musicView || ''
    my.musicGenre = props.musicGenre || ''
    my.musicContent = my.musicView
    if (known) {
      my.navId = known.Id
      if (!props.preview) store.navSection = known.Id
    }
    const lib = my.lib
    my.ct = ((lib && lib.CollectionType) || '').toLowerCase()
    my.filterMode = !!(my.genre || my.studio)
    my.key = lib && lib.Id ? lib.Id : my.genre ? `genre-${my.genre}` : my.studio ? `studio-${my.studio}` : 'default'
    my.parentId = lib ? lib.Id : null
    const key = my.key
    const [imageType, direction, groupBy, folderView, sortKey, sortOrder, filters] = await Promise.all([
      getFromStorage(`library_imageType_${key}`),
      getFromStorage(`library_gridDirection_${key}`),
      getFromStorage(`library_groupBy_${key}`),
      getFromStorage(`library_folderView_${key}`),
      getFromStorage(`library_sortKey_${key}`),
      getFromStorage(`library_sortOrder_${key}`),
      getFromStorage(filtersKey()),
    ]).catch(() => [])
    my.imageType = imageType || 'poster'
    my.direction = direction || 'vertical'
    my.groupByStored = groupBy || 'none'
    my.folderViewStored = folderView || null
    my.sortKeyStored = sortKey || null
    my.sortOrder = sortOrder || ''
    my.filters = { ...NO_FILTERS, ...(filters || {}) }
    await fontsReady()
    loadFacets()
    if (my.genre) loadGenreLibraries()
    reload(true)
  }
  const filtersKey = () => `library_filters_${my.key}${my.musicView ? '_' + my.musicView : ''}`
  const filterParams = (filters) => buildFilterParams({ ...filters, genreFilters: my.genre ? [] : my.musicGenre ? [my.musicGenre] : filters.genreFilters })

  // What the library is and how it's shown, worked out again whenever a choice changes.
  const derive = () => {
    const s = props.prefs || settings.all()
    const lib = my.lib
    const ct = my.ct
    const isMovie = ct === 'movies'
    const isSeries = ct === 'tvshows'
    const isPlaylist = ct === 'playlists'
    const mixed = !!lib && (!ct || ct === 'folders')
    const homeVideos = ct === 'homevideos'
    const canFolderView = !!lib && !my.filterMode && !my.musicView && !my.merged
    const fv = my.folderViewStored
    const isFolderView = canFolderView && (fv === 'on' || (fv !== 'off' && (mixed || homeVideos)))
    const plex = my.serverType === 'plex'
    const music = !!my.musicView
    const songs = my.musicContent === 'songs'
    const sortKeys = librarySortKeys({
      songs, music, series: isSeries, books: false, folders: isFolderView,
      movieOrSeries: isMovie || isSeries, myRating: !!s.useMoonfinPlugin && !plex && !my.merged, plex,
    })
    const sortKey = sortKeys.indexOf(my.sortKeyStored) >= 0 ? my.sortKeyStored : isFolderView ? 'FoldersFirst' : 'SortName'
    const ascending = savedSortOrder(my.sortOrder, sortKey) !== 'Descending'
    const canGroup = (isMovie || isSeries) && !isFolderView
    const groupBy = LIBRARY_GROUP_OPTIONS.indexOf(my.groupByStored) >= 0 ? my.groupByStored : 'none'
    const groupingOn = s.playlistsGroupByType !== false
    const playlistGrouped = isPlaylist && groupingOn && !isFolderView
    const groupedActive = (canGroup && groupBy !== 'none') || playlistGrouped
    const style = s.libraryStyle === 'modern' || s.libraryStyle === 'docked' ? s.libraryStyle : 'classic'
    my.f = {
      s, lib, ct, music, songs, isMovie, isSeries, isPlaylist, mixed, homeVideos, canFolderView, isFolderView, plex, sortKeys, sortKey,
      ascending, canGroup, groupBy, groupingOn, playlistGrouped, groupedActive, style,
      showAlphabet: s.showAlphabeticalFilters === true,
      showLetters: s.showAlphabeticalFilters === true && !groupedActive && alphabetApplies({ sortKey, music, songs }),
      showText: s.libraryCardTitles !== false,
      detailed: s.useDetailedSubHeadings !== false,
      info: s.showMediaDetailsOnLibraryPage !== false,
      imageType: isPlaylist || music ? 'square' : my.imageType,
      imageSize: libraryPosterSize(s, isPlaylist),
      horizontal: my.direction === 'horizontal',
    }
    return my.f
  }
  const reload = (landing) => {
    const f = derive()
    my.gen++
    my.pending = null
    my.fetched = 0
    my.total = 0
    my.blocked = 0
    my.dirs = 0
    my.seen = {}
    my.items = []
    my.group = null
    my.landing = landing !== false
    batch(() => {
      st.loading = true
      st.focusedItem = null
      layout()
      redraw()
    })
    const gen = my.gen
    return loadPage().then(() => {
      if (gen !== my.gen) return
      land()
      if (f.groupedActive) loadAll(gen)
    })
  }
  const loadPage = () => {
    if (my.pending) return my.pending
    if (my.fetched > 0 && my.fetched >= my.total) return Promise.resolve()
    const gen = my.gen
    my.pending = fetchPage(gen)
      .catch((e) => console.error('[library] load failed', e))
      .then(() => {
        if (gen !== my.gen) return
        my.pending = null
        batch(() => {
          st.loading = false
          redraw()
        })
        refocus()
      })
    return my.pending
  }
  // The title focus is on, in the grid or in a group's row, so focus can follow it through a fold.
  const focusedTitle = () => {
    const at = activeElement()
    let card = null
    if (grid && isInside(at, grid)) card = grid.current()
    else if (my.zone === 'rows') {
      const row = st.groupRows[my.rowFocus]
      const node = row && rowRefs[row.key]
      if (node && isInside(at, node)) card = node.current()
    }
    return card && card.raw ? copyKey(card.raw) : null
  }
  // Focus stays on its title when cards ahead of it are taken down, and follows a card folded into another to that one.
  const refocus = () => {
    const key = my.refocus
    if (!key) return
    my.refocus = null
    if (grid) {
      const items = my.shownItems || []
      const index = items.findIndex((it) => copyKey(it) === key)
      if (index < 0) return
      grid.focusIndex(index)
      showFocused(items[index])
      if (!isInside(activeElement(), grid)) {
        my.zone = 'grid'
        focusZone()
      }
      return
    }
    // A title can sit in more than one group, so the row focus is on is looked in first.
    const rows = st.groupRows
    const order = rows.map((_, r) => r).filter((r) => r !== my.rowFocus)
    if (rows[my.rowFocus]) order.unshift(my.rowFocus)
    for (let n = 0; n < order.length; n++) {
      const r = order[n]
      const index = rows[r].items.findIndex((c) => c.raw && copyKey(c.raw) === key)
      const node = rowRefs[rows[r].key]
      if (index < 0 || !node) continue
      my.zone = 'rows'
      my.rowFocus = r
      st.rowsY = rowScroll(r)
      node.focusIndex(index)
      showFocused(rows[r].items[index].raw)
      focusZone()
      return
    }
  }
  // Grouping covers the whole library, so the rest of it loads behind the first page.
  const loadAll = async (gen) => {
    while (gen === my.gen && my.fetched < my.total) {
      const before = my.fetched
      await loadPage()
      if (my.fetched === before) break
    }
  }
  const fetchPage = async (gen) => {
    const f = my.f
    const filters = my.filters
    const status = statusFiltersFor(filters)
    const extra = filterParams(filters)
    const order = f.ascending ? 'Ascending' : 'Descending'
    const start = my.fetched
    let res
    if (f.isFolderView) {
      const foldersFirst = f.sortKey === 'FoldersFirst'
      const folderId = my.stack.length ? my.stack[my.stack.length - 1].id : f.lib.Id
      const shared = { ParentId: folderId, SortOrder: order, Fields: FOLDER_FIELDS, ...(status.length ? { Filters: status.join(',') } : {}), ...extra }
      const first = start === 0
      const pair = await Promise.all([
        my.api.getItems({
          ...shared, StartIndex: first ? 0 : start - my.dirs, Limit: PAGE, SortBy: sortField(f.sortKey),
          ...(foldersFirst ? { ExcludeItemTypes: DIRECTORY_TYPES } : {}), EnableTotalRecordCount: true,
        }),
        first && foldersFirst ? my.api.getItems({ ...shared, SortBy: 'SortName', IncludeItemTypes: DIRECTORY_TYPES, EnableTotalRecordCount: false }) : null,
      ])
      res = pair[0]
      const dirs = pair[1]
      if (gen !== my.gen) return
      let page = (res && res.Items) || []
      const top = my.stack.length ? (my.stack[my.stack.length - 1].collectionType || '').toLowerCase() : ''
      if (top === 'movies' || top === 'tvshows') page = page.filter((i) => i.Type !== 'BoxSet')
      if (first) {
        const folders = (dirs && dirs.Items) || []
        my.dirs = folders.length
        page = folders.concat(page)
      }
      my.fetched += page.length
      my.total = ((res && res.TotalRecordCount) || 0) + my.dirs
      take(page)
      return
    }
    const group = !!f.s.groupItemsIntoCollections
    const params = {
      StartIndex: start, Limit: PAGE, SortBy: sortField(f.sortKey), SortOrder: order, Recursive: true,
      EnableTotalRecordCount: true, Fields: FIELDS + (f.isPlaylist ? ',ChildCount,RecursiveItemCount' : ''),
    }
    if (my.parentId) params.ParentId = my.parentId
    if (my.genre) params.Genres = my.genre
    if (my.studio) params.Studios = my.studio
    const content = f.music ? MUSIC_CONTENT_TYPES.find((c) => c.key === my.musicContent) || MUSIC_CONTENT_TYPES[0] : null
    const types = content ? content.itemType : itemTypesFor(f.lib, group)
    if (types) params.IncludeItemTypes = types
    const exclude = excludeTypesFor(f.lib, !!my.genre, f.mixed, group)
    if (exclude) params.ExcludeItemTypes = exclude
    if (my.filterMode || f.isMovie || f.isSeries) params.CollapseBoxSetItems = group
    if (status.length) params.Filters = status.join(',')
    const seriesStatus = SERIES_STATUS_BY_KEY[filters.seriesFilter]
    if (seriesStatus) params.SeriesStatus = seriesStatus
    Object.assign(params, extra)
    // Playlists aren't children of the music library, so they're fetched without a parent.
    // Artists, album artists and genres are lists behind their own endpoints.
    if (content && content.key === 'playlists') delete params.ParentId
    const own = !!content && ['albumArtists', 'artists', 'genres'].indexOf(content.key) >= 0
    // Everything the viewer rated loads as one page, since the plugin serves ids and scores
    // rather than a sorted stream. With the plugin out of reach the name sort stands in.
    const rated = !own && !my.merged && f.sortKey === 'MyRating' && start === 0 && my.api.getMyUserRatings
      ? await my.api.getMyUserRatings().then((r) => orderByMyRating(r && r.Items, f.ascending)).catch(() => null)
      : null
    if (rated) {
      const plain = (id) => String(id).replace(/-/g, '').toLowerCase()
      const found = {}
      for (let i = 0; i < rated.length; i += 100) {
        const chunk = rated.slice(i, i + 100)
        const r = await my.api.getItems({ ...params, StartIndex: 0, Limit: chunk.length, Ids: chunk.join(',') })
        ;((r && r.Items) || []).forEach((it) => {
          found[plain(it.Id)] = it
        })
      }
      const ordered = rated.map((id) => found[plain(id)]).filter(Boolean)
      res = { Items: ordered, TotalRecordCount: ordered.length }
    } else if (own && content.key === 'genres') {
      res = await my.api.getMusicGenres({
        ParentId: f.lib.Id, StartIndex: start, Limit: PAGE, SortBy: sortField(f.sortKey), SortOrder: order,
        EnableTotalRecordCount: true, Fields: 'PrimaryImageAspectRatio,ItemCounts',
      })
    } else if (own) {
      const artistParams = {
        ParentId: f.lib.Id, StartIndex: start, Limit: PAGE, SortBy: sortField(f.sortKey), SortOrder: order, EnableTotalRecordCount: true,
        Fields: 'PrimaryImageAspectRatio,SortName,ProductionYear,ImageTags,UserData', ImageTypeLimit: 1, EnableImageTypes: 'Primary,Backdrop,Thumb',
        ...(status.length ? { Filters: status.join(',') } : {}),
      }
      res = await (content.key === 'albumArtists' ? my.api.getAlbumArtists(artistParams) : my.api.getArtists(artistParams))
    } else if (my.merged) {
      res = await fetchMergedPage(start, params, gen)
    } else {
      res = await my.api.getItems(params)
    }
    if (gen !== my.gen) return
    const raw = (res && res.Items) || []
    let page = raw
    if (exclude && page.length) {
      const list = exclude.split(',')
      page = page.filter((it) => list.indexOf(it.Type) < 0)
    }
    my.fetched += raw.length
    my.total = (res && res.TotalRecordCount) || 0
    take(page)
  }
  // The server libraries a merged library spans. A lookup some server missed is made again on the
  // next load.
  const mergedSources = async () => {
    const cur = my.mergedLookup
    if (cur && cur.complete && cur.sources) return cur.sources
    const { sources, complete } = await connectionPool.getMergedLibrarySources(my.merged)
    if (!sources.length) {
      if (cur && cur.sources) return cur.sources
      throw new Error(`No server answered for ${my.merged}`)
    }
    my.mergedLookup = { sources, complete }
    my.serverTypes = sources.map((source) => source.server._serverType || 'jellyfin')
    return sources
  }
  // Every title the first server of a merged library holds, which is the signed-in one whenever it has this library.
  const readPreferredCopies = async (sources, params) => {
    const serverId = sources[0].server._serverId
    const own = sources.filter((source) => source.server._serverId === serverId)
    if (own.length === sources.length) return null
    try {
      const read = await Promise.all(own.map((source) => readSharedTitles(source, params)))
      return new PreferredCopies(serverId, new Set(read.flat().flatMap(titleMatchKeys)))
    } catch (e) {
      // Without the list, the first copy shown keeps the card.
      return null
    }
  }
  // Every server's titles by match key. A server that doesn't answer is left out of it, and its copies come up as
  // paging reaches them, the way they would without the index.
  const readTitleIndex = async (sources, params) => {
    const read = await Promise.all(sources.map((source) => readSharedTitles(source, params).catch(() => null)))
    return indexCopies(read.filter(Boolean).flat())
  }
  // Gives the cards already up the copies the index holds for them, once it's in. The copies go to the card the fold
  // holds for the title, which every key of it leads to.
  const joinIndexed = (index) => {
    const isShown = (copy) => !!my.rendered[copyKey(copy)]
    let grown = false
    my.items.forEach((card) => {
      const holder = titleMatchKeys(card).map((key) => my.holders.get(key)).find(Boolean) || card
      if (joinIndexedCopies(holder, index, my.holders, isShown)) grown = true
    })
    // A card that took on a copy draws again with its server count.
    if (grown) redraw()
  }
  // The next page of a merged library, read from every server and merged in the sort's order.
  const fetchMergedPage = async (start, params, gen) => {
    // A later page keeps reading the servers the first one did. A server that answers again only joins on the next
    // load, since the readers already paging can't take it on partway.
    const sources = start > 0 && my.mergedLookup ? my.mergedLookup.sources : await mergedSources()
    // A newer load started while the sources were looked up, and the paging state is now its own.
    if (gen !== my.gen) return { Items: [], TotalRecordCount: 0 }
    if (start === 0) {
      my.readers = createMergedReaders(sources)
      my.holders = new Map()
      my.rendered = {}
      my.preferred = null
      my.copyIndex = null
    }
    // Held here, since a reload swaps in new readers while this one waits.
    const readers = my.readers
    const isCurrent = () => readers === my.readers && gen === my.gen
    // An old TV skips the reads of every title, and copies fold as paging reaches them.
    const readsTitles = start === 0 && readsEveryTitle()
    if (readsTitles) {
      // In the background, so the first page shows as soon as it's read. The cards already up learn of their copies
      // once it's in.
      readTitleIndex(sources, params).then((index) => {
        // Another load, of this library or another one, took over while the index was read.
        if (!isCurrent()) return
        my.copyIndex = index
        joinIndexed(index)
      }, () => {})
    }
    // Other servers' copies are held back for the signed-in server's own card, except while a filter is on, since
    // that server's copy could be filtered out.
    const preferred = readsTitles && !hasActiveFilters(my.filters) ? readPreferredCopies(sources, params) : null
    const shared = { ...params, Fields: params.Fields + MERGED_FIELDS }
    delete shared.ParentId
    const compare = mergedSortComparator(params.SortBy, params.SortOrder === 'Descending')
    const result = await takeMergedPage(readers, params.Limit || PAGE, compare, (source, from, limit) => (
      source.api.getItems({ ...shared, ParentId: source.libraryId, StartIndex: from, Limit: limit })
    ))
    if (preferred) {
      // Given a moment, not waited on: a slow read lets the first page show, and its copies still fold together.
      const TOO_SLOW = {}
      let timer = null
      const late = new Promise((resolve) => {
        timer = setTimeout(() => resolve(TOO_SLOW), PREFERRED_WAIT_MS)
      })
      const copies = await Promise.race([preferred, late])
      clearTimeout(timer)
      if (copies !== TOO_SLOW) {
        if (isCurrent()) my.preferred = copies
      } else {
        // The pages after it hold copies back for the signed-in server's card once its titles are in.
        preferred.then((arrived) => {
          if (isCurrent()) my.preferred = arrived
        }, () => {})
      }
    }
    return result
  }
  // A merged page: a copy joins the card already shown for its title, and a card an item shows to be
  // the same title as another is folded into it and taken down. Both count as dropped rows.
  const takeMerged = (page) => {
    const allowed = withoutBlockedItems(page)
    const fresh = allowed.filter((it) => {
      const k = copyKey(it)
      if (my.rendered[k]) return false
      my.rendered[k] = true
      return true
    })
    const absorbed = []
    const focusedKey = focusedTitle()
    const noteFold = (holder, card) => {
      if (!card) return
      absorbed.push(card)
      // Focus follows the card it's on, or the one it already moved to, through every fold to the card left.
      const cardKey = copyKey(card)
      if (focusedKey && (cardKey === focusedKey || cardKey === my.refocus)) my.refocus = copyKey(holder)
    }
    let shown = foldCopies(fresh, my.holders, my.preferred, noteFold)
    // A copy waiting for a card that never came, such as one hidden from this user, gets its own card once the list
    // runs out.
    if (my.preferred && mergedReadersDrained(my.readers)) {
      shown = shown.concat(foldCopies(my.preferred.takeAllWaiting(), my.holders, null, noteFold))
    }
    let takenDown = 0
    if (absorbed.length) {
      // The grid keeps focus by position, so a card taken down ahead of the focused one would slide focus onto the next
      // title. Focus goes back to its own card, by key, once the list has changed.
      if (focusedKey && !my.refocus) my.refocus = focusedKey
      shown = shown.filter((it) => absorbed.indexOf(it) < 0)
      const before = my.items.length
      my.items = my.items.filter((it) => absorbed.indexOf(it) < 0)
      takenDown = before - my.items.length
    }
    // The index, once in, gives each new card the copies paging hasn't reached.
    if (my.copyIndex) {
      const isShown = (copy) => !!my.rendered[copyKey(copy)]
      shown.forEach((card) => joinIndexedCopies(card, my.copyIndex, my.holders, isShown))
    }
    my.blocked += page.length - shown.length + takenDown
    my.items.push(...shown)
    // A page that only held copies leaves nothing new to scroll to, so the next one is read now.
    if (!shown.length && page.length) later(() => loadPage(), 0)
  }
  // Adds a fetched page, less what the ratings filter drops, and anything a random sort sent twice.
  const take = (page) => {
    if (my.merged) takeMerged(page)
    else takePlain(page)
    if (my.f.playlistGrouped || my.playlistTypes.length < PLAYLIST_CATEGORIES.length) resolvePlaylists()
    if (props.onLibraryItems) props.onLibraryItems({ items: my.items, loaded: my.fetched, total: my.total })
  }
  const takePlain = (page) => {
    const allowed = withoutBlockedItems(page)
    my.blocked += page.length - allowed.length
    allowed.forEach((it) => {
      if (my.seen[it.Id]) return
      my.seen[it.Id] = true
      my.items.push(it)
    })
  }
  // The summary can't tell music from audiobooks or music videos from movies, so those playlists
  // are read once, a few at a time, and remembered.
  const resolvePlaylists = async () => {
    if (!my.f.isPlaylist) return
    const pending = my.items.filter((it) => playlistNeedsItemCheck(it) && !my.resolving[it.Id])
    if (!pending.length) return
    const gen = my.gen
    for (let i = 0; i < pending.length && gen === my.gen; i += 3) {
      const chunk = pending.slice(i, i + 3)
      chunk.forEach((it) => {
        my.resolving[it.Id] = true
      })
      const resolved = await Promise.all(chunk.map((it) => my.api.getPlaylistItems(it.Id, PLAYLIST_SAMPLE_SIZE)
        .then((r) => [it.Id, playlistCategoryFromItems(r && r.Items)])
        .catch(() => [it.Id, playlistSummaryCategory(it)])))
      resolved.forEach(([id, cat]) => {
        my.categories[id] = cat
      })
      if (gen === my.gen) redraw()
    }
  }
  const loadFacets = async () => {
    try {
      // A merged library offers the values every server's library holds.
      const group = !!settings.get('groupItemsIntoCollections')
      const values = my.merged
        ? mergeFacetValues(await Promise.all((await mergedSources()).map((source) => (
          source.api.getQueryFilters ? source.api.getQueryFilters(source.libraryId, itemTypesFor(my.lib, group)).catch(() => null) : null
        ))))
        : await my.api.getQueryFilters(my.parentId, itemTypesFor(my.lib, group))
      my.facets = values
      if (st.panel === 'sort') openPanel('sort', true)
    } catch (e) {
      my.facets = null
    }
  }
  const loadGenreLibraries = async () => {
    try {
      const res = await my.api.getLibraries()
      my.genreLibraries = ((res && res.Items) || []).filter((l) => {
        const t = (l.CollectionType || '').toLowerCase()
        return !t || t === 'movies' || t === 'tvshows'
      })
    } catch (e) {
      my.genreLibraries = []
    }
  }

  // The loaded items as shown: the watched state known now laid over them, narrowed by the
  // search and the playlist types, then grouped when grouping is on.
  const shown = () => {
    const f = my.f
    let list = userDataSync.applyAll(my.items)
    const q = foldForSearch(my.query.trim())
    // A merged card also answers to each copy's title and the original title they share.
    if (q) list = list.filter((it) => foldForSearch(my.merged ? mergedSearchText(it) : it.SortName || it.Name || '').indexOf(q) >= 0)
    if (f.isPlaylist && my.playlistTypes.length < PLAYLIST_CATEGORIES.length) {
      list = list.filter((it) => it.Type !== 'Playlist' || my.playlistTypes.indexOf(playlistCategory(it, my.categories)) >= 0)
    }
    return list
  }
  const redraw = () => {
    if (!my.f) return
    batch(() => {
      const f = my.f
      const list = shown()
      let groups = null
      if (f.playlistGrouped) groups = groupPlaylists(list, my.categories)
      else if (f.groupedActive) groups = groupLibraryItems(list, f.groupBy)
      const tabs = !!groups && !f.playlistGrouped && !f.horizontal && groups.length > 0
      const hadTabs = !!my.tabs
      my.groups = groups
      my.tabs = tabs ? groups : null
      let items = list
      if (tabs) {
        const active = groups.find((g) => g.name === my.group) || groups[0]
        my.group = active.name
        items = active.items
      }
      my.shownItems = items
      my.count = Math.max(0, my.total - my.blocked)
      const hasSubs = f.showText && items.some((it) => cardSubtitle(it, isFolder(it), f.detailed))
      if (hasSubs !== my.hasSubs || hadTabs !== tabs) {
        my.hasSubs = hasSubs
        layout()
      }
      if (groups && !tabs) {
        // A media row per group, the first 40px under the toolbar.
        const type = f.playlistGrouped ? 'square' : 'poster'
        let y = 40
        st.groupRows = groups.map((g) => {
          const cards = g.items.map((it, i) => reuse(g.name, it, i, () => toCard(it, type, i)))
          const h = Row.heightFor('media', cards, type)
          const row = { key: g.name, title: g.name, type, y, h, items: cards }
          y += h
          return row
        })
        st.cards = []
      } else {
        st.groupRows = []
        st.cards = items.map((it, i) => reuse(null, it, i, (moved) => (moved ? { ...moved, key: it.Id + '-' + i, idx: i } : cardFor(it, i))))
      }
      st.emptyText = !st.loading && !items.length && !(groups && groups.length) ? $L('No items found') : ''
      st.skeleton = st.loading && !items.length ? skeletonCells() : []
      chrome()
    })
  }
  // The cards already built, by the item each shows and the row it's in (null for the grid), so a
  // redraw builds only the cards whose item, place or server count changed. A grid card that only
  // moved is handed to `build` to take its new place. A new look, grid size, theme or face that
  // finished loading builds them all again.
  let built = new Map()
  let builtFor = {}
  const reuse = (row, it, i, build) => {
    const v = untrack(() => store.settingsVersion)
    if (builtFor.f !== my.f || builtFor.m !== my.metrics || builtFor.v !== v) {
      built = new Map()
      builtFor = { f: my.f, m: my.metrics, v }
    }
    if (!built.has(row)) built.set(row, new WeakMap())
    const cache = built.get(row)
    const servers = my.merged ? serverCountOf(it) : 0
    const had = cache.get(it)
    const same = had && had.servers === servers
    if (same && had.card.idx === i) return had.card
    const card = build(same ? had.card : null)
    cache.set(it, { card, servers })
    return card
  }
  const isFolder = (it) => my.f.isFolderView && it.IsFolder && FOLDER_DETAIL_TYPES.indexOf(it.Type) < 0
  const cardFor = (it, i) => {
    const f = my.f
    const folder = isFolder(it)
    const cardW = my.metrics.cardW
    // Double spaces in the subtitle fold into one, and both lines cut mid-word.
    const subtitle = f.showText ? fitText((cardSubtitle(it, folder, f.detailed) || '').replace(/\s+/g, ' '), 17, 'regular', cardW) : ''
    const title = fitText(it.Name || '', 19, 'bold', cardW)
    const server = it._serverUrl || my.server
    let id = getPrimaryImageId(it)
    let type = 'Primary'
    if (f.imageType === 'thumbnail' && it.ImageTags && it.ImageTags.Thumb) {
      id = it.Id
      type = 'Thumb'
    } else if (f.imageType === 'banner') {
      // Cropping a portrait poster down to a banner loses the most, so it comes last.
      const wide = ['Banner', 'Backdrop', 'Thumb'].find((t) => (t === 'Backdrop' ? it.BackdropImageTags && it.BackdropImageTags.length : it.ImageTags && it.ImageTags[t]))
      if (wide) {
        id = it.Id
        type = wide
      }
    }
    const opts = f.imageType === 'banner' ? { maxWidth: my.metrics.bannerWidth, quality: 70 } : { maxHeight: 300, quality: 70 }
    const ud = it.UserData || {}
    const clip = showsVideoBadge(it) ? videoBadgeDuration(it) : null
    return {
      key: it.Id + '-' + i,
      idx: i,
      image: id ? getImageUrl(server, id, type, opts) : '',
      icon: folder ? 'lib_folder' : 'lib_movie',
      title,
      titleFont: fontFor(title, 'bold'),
      subtitle,
      subtitleFont: fontFor(subtitle),
      fav: !!ud.IsFavorite,
      played: !!ud.Played,
      clip,
      clipW: clip == null ? 0 : 6 + 18 + (clip ? 2 + textWidth(clip, 17, 'bold') + 3 : 0) + 6,
      servers: my.merged ? serverCountOf(it) : 0,
      raw: it,
    }
  }
  // The header, the details block and the grid's place and size for the style in use.
  const layout = () => {
    const f = my.f
    const docked = f.style === 'docked'
    const gridW = 1920 - GRID_INSET - (docked ? 420 : 0)
    const c = chromeModel()
    const containerTop = c.gridTop + (my.tabs ? 4 + 63 + 10 : 0)
    const viewTop = containerTop + 10
    const viewH = 1080 - containerTop - 20
    const m = gridMetrics({
      imageType: f.imageType, size: f.imageSize, gridWidth: gridW, viewH, showText: f.showText,
      hasSubtitles: !!my.hasSubs, horizontal: f.horizontal,
    })
    my.metrics = m
    const t = theme()
    batch(() => {
      st.gridX = c.gridX
      st.gridW = gridW
      st.viewTop = viewTop
      st.viewH = viewH
      st.cols = m.cols
      st.tileW = m.tileW
      st.tileH = m.tileH
      st.horizontal = f.horizontal
      st.infoX = c.infoX
      st.infoY = c.infoY
      st.infoW = gridW
      st.tileOpts = {
        cellW: m.tileW, cellH: m.tileH, padX: m.padX, padY: m.padY, cardW: m.cardW, cardH: m.cardH, posterH: m.posterH,
        showText: f.showText, ms: focusMs(200), slide: slideMs(200), artBg: '#ffffff0d', mutedIcon: '#ffffff4d',
        favY: 8, boldFont: uiFont('bold'), watchedBg: t.badgeWatched, onBadge: t.onBadge, textShadow: true,
        ...(neonOn() ? NEON_TILE : {}),
        // A focused card rings in the focus color, so the Focus Color setting reaches it.
        ring: { width: 3, color: colorNum(t.focus) },
      }
    })
  }
  const chromeModel = () => {
    const c = chromeLayout()
    // The search field keeps its focus ring, and drops its placeholder, while its keyboard is up.
    const search = st.keyboard && my.kbTarget === 'library' && c.controls.find((x) => x.id === 'search')
    if (search) {
      search.held = true
      if (!my.query) search.label = ''
    }
    return c
  }
  const chromeLayout = () => {
    const f = my.f
    const lib = f.lib
    const musicTitle = f.music && MUSIC_TITLES[my.musicContent]
    const title = my.genre || my.studio || (musicTitle ? $L(musicTitle) : '') || (lib && lib.Name) || ''
    const neon = neonOn()
    return libraryChrome({
      style: f.style,
      title,
      titleFont: neon ? displayFont('bold', title) : fontFor(title, 'regular'),
      neon,
      count: my.count || 0,
      crumbs: f.isFolderView && my.stack.length ? my.stack.map((s) => ({ name: s.name, font: fontFor(s.name, 'bold') })) : null,
      rootName: (lib && lib.Name) || '',
      crumbFonts: [fontFor((lib && lib.Name) || '', 'bold')].concat(my.stack.map((s) => fontFor(s.name, 'bold'))),
      query: my.query,
      info: f.info,
      letters: f.showLetters,
      group: f.canGroup,
      shuffle: f.songs,
      show: !f.music,
      settings: !f.music,
      sortLabel: sortLabel(f.sortKey, f.music),
      ascending: f.ascending,
      groupLabel: groupByLabel(f.groupBy),
      showLabel: playedLabel(my.filters.playedFilter, false),
      displayLabel: f.isPlaylist ? '' : (IMAGE_TYPE_OPTIONS.find((o) => o.key === my.imageType) || IMAGE_TYPE_OPTIONS[0]).label(),
      ms: focusMs(150),
    })
  }
  // Builds the header's controls and text, with the group tabs under them when there are any.
  const chrome = () => {
    const c = chromeModel()
    const controls = c.controls
    if (my.tabs) {
      const x = my.f.style === 'docked' ? 420 + 87 : 87
      const y = c.gridTop + 4
      const t = theme()
      const tabs = []
      let w = 4
      my.tabs.forEach((g, i) => {
        const label = `${g.name} (${g.items.length})`
        const active = g.name === my.group
        const tw = Math.ceil(textWidth(label, 19, active ? 'bold' : 'medium')) + 44 + 6
        tabs.push({
          id: 'tab-' + i, group: 'tabs', kind: 'tab', tab: g.name, x: x + w, y: y + 4, w: tw, h: 55, r: 27.5, ms: focusMs(120),
          base: active ? t.accent : '', ring: true, ringBorder: { w: 3, color: colorNum(t.focus) },
          label, lfont: uiFont(active ? 'bold' : 'medium'), lsize: 19, lx: 25, ly: 14, lh: 27, lmax: tw,
          labelOff: active ? t.onAccent : t.os(0.75), labelOn: active ? t.onAccent : t.os(0.75),
          next: { down: 'out', up: 'out' },
        })
        w += tw
      })
      c.boxes.push({ k: 'tabbar', x, y, w: Math.min(w + 4, st.gridW), h: 63, r: 31.5, color: t.os(0.08) })
      controls.push(...tabs)
    }
    batch(() => {
      st.controls = controls
      st.texts = c.texts
      st.boxes = c.boxes
    })
  }
  const skeletonCells = () => {
    const f = my.f
    const m = my.metrics
    const cells = []
    const count = f.horizontal ? 10 : 20
    for (let i = 0; i < count; i++) {
      const col = f.horizontal ? i : i % m.cols
      const row = f.horizontal ? 0 : Math.floor(i / m.cols)
      const x = col * m.tileW + m.padX
      const y = row * m.tileH + m.padY
      if (y > st.viewH) break
      cells.push({ k: 'p' + i, x, y, w: m.cardW, h: m.posterH })
      if (f.showText) {
        cells.push({ k: 't' + i, x, y: y + m.posterH + 6, w: m.cardW * 0.75, h: 19 })
        cells.push({ k: 's' + i, x, y: y + m.posterH + 29, w: m.cardW * 0.45, h: 17 })
      }
    }
    return cells
  }

  // Focus lands on Home the first time the library comes up, and on the grid once a reload
  // has cleared it, but not while a dialog is up, since that's the viewer still picking.
  const land = () => {
    if (!my.landing || st.panel) return
    my.landing = false
    if (props.preview) {
      const first = (my.shownItems || [])[0]
      if (first) showFocused(first)
      return
    }
    if (!my.landed) {
      my.landed = true
      my.zone = 'chrome'
      if (chromeRef) chromeRef.select('home')
    } else {
      my.zone = st.groupRows.length ? 'rows' : st.cards.length ? 'grid' : 'chrome'
      if (my.zone === 'grid') later(() => grid && grid.reset(), 0)
    }
    focusZone()
  }
  // Up and Down between rows glide the row they land on to 10 under the top. The rows already start
  // 10 down, and the room under the last row lets it scroll that far.
  const rowScroll = (i) => -st.groupRows[i].y
  const focusZone = () => {
    // A page kept under another one never takes focus from it.
    if (props.preview || (props.page && !props.page.active())) return
    // The photo viewer over this library keeps the remote.
    if (props.viewing) return
    if (st.keyboard) {
      if (kb && my.kbOverlay) kb.setFocus()
      return
    }
    if (st.panel && panelRef) return panelRef.setFocus()
    if (my.zone === 'grid' && grid) return grid.setFocus()
    if (my.zone === 'rows' && st.groupRows.length) {
      const at = st.groupRows[my.rowFocus]
      const row = at && rowRefs[at.key]
      if (row) return row.setFocus()
    }
    my.zone = 'chrome'
    if (chromeRef) chromeRef.setFocus()
  }
  const toGrid = () => {
    if (st.groupRows.length) {
      my.zone = 'rows'
      my.rowFocus = 0
      st.rowsY = 0
    } else if (st.cards.length) my.zone = 'grid'
    else return false
    focusZone()
    return true
  }
  const toChrome = (target) => {
    if (!chromeRef) return
    if (target.charAt(0) === '@') chromeRef.selectGroup(target.slice(1))
    else chromeRef.select(target)
    my.zone = 'chrome'
    focusZone()
  }
  // Where Up from the grid's top row goes, and Left from its first column in the docked style.
  const aboveGrid = () => {
    const f = my.f
    if (my.tabs) return 'tab-' + Math.max(0, my.tabs.findIndex((g) => g.name === my.group))
    if (f.style === 'docked') return '@dock'
    if (f.showLetters) return 'L-#'
    return f.style === 'modern' ? '@bar' : '@toolbar'
  }
  const onChromeEdge = (dir, c) => {
    // Down out of the header lands on the active group tab when there are tabs.
    if (dir === 'down' && my.tabs && c.group !== 'tabs') return toChrome(aboveGrid()) || true
    if (dir === 'down') return toGrid() || true
    if (dir === 'right' && my.f.style === 'docked' && c.group === 'dock') return toGrid() || true
    if (dir === 'up' && c.group === 'tabs') {
      const style = my.f.style
      if (style !== 'docked') toChrome(style === 'modern' ? '@bar' : '@toolbar')
      return true
    }
    return true
  }
  let settle = null
  onCleanup(() => clearTimeout(settle))
  const onGridFocus = (card) => {
    clearTimeout(settle)
    settle = setTimeout(() => showFocused(card.raw), FOCUS_SETTLE_MS)
  }
  const onRowFocus = (card) => card && showFocused(card.raw)
  const showFocused = (item) => {
    st.focusedItem = item
    const f = my.f
    if (f.s.hideBackdropsInLibraries) {
      st.backdrop = ''
      return
    }
    const own = item && item.BackdropImageTags && item.BackdropImageTags.length
    const parent = item && item.ParentBackdropImageTags && item.ParentBackdropImageTags.length
    const id = own ? item.Id : parent ? item.ParentBackdropItemId : null
    const tag = own ? item.BackdropImageTags[0] : parent ? item.ParentBackdropImageTags[0] : null
    st.backdrop = id ? getImageUrl(item._serverUrl || my.server, id, 'Backdrop', { maxWidth: 1920, quality: 80, tag }) : ''
  }

  // How many photos and videos the open folder holds, so the viewer shows an exact total before the
  // rest of the folder has loaded. Only a folder view lists a folder's own items, and a search,
  // matched on what's loaded, goes without one.
  const countPhotos = () => {
    const f = my.f
    if (!f.isFolderView || my.query.trim() || !props.onLibraryPhotoCount) return
    const filters = my.filters
    const status = statusFiltersFor(filters)
    my.api.getItems({
      ParentId: my.stack.length ? my.stack[my.stack.length - 1].id : f.lib.Id,
      IncludeItemTypes: 'Photo,Video',
      Limit: 1,
      EnableTotalRecordCount: true,
      ...(status.length ? { Filters: status.join(',') } : {}),
      ...filterParams(filters),
    }).then((r) => {
      if (r && r.TotalRecordCount > 0) props.onLibraryPhotoCount(r.TotalRecordCount)
    }, () => {})
  }
  const openItem = (it) => {
    if (!it) return
    if (isFolder(it)) {
      my.stack = my.stack.concat([{ id: it.Id, name: it.Name, collectionType: it.CollectionType }])
      reload(true)
      return
    }
    if (it.Type === 'Audio') playQueue(shuffleRouter, [it], 0)
    else if (it.Type === 'MusicAlbum') router.to(`/album/${it.Id}`)
    else if (it.Type === 'MusicArtist') router.to(`/artist/${it.Id}`)
    // The photo page holding this library opens its viewer on the folder.
    else if (it.Type === 'Photo' && props.onViewPhoto) {
      props.onViewPhoto(it, my.shownItems || my.items, { loaded: my.fetched, total: my.total })
      if (my.fetched < my.total) countPhotos()
    }
    else if (it.Type === 'Photo' || it.Type === 'PhotoAlbum') router.to(`/photos/${it.Type === 'PhotoAlbum' ? it.Id : it.ParentId}`)
    // A title from another server's library opens there.
    else router.to(`/details/${it.Id}`, detailsData(it._serverUrl ? it : my.lib))
  }
  // Holding OK on a card opens its long press menu, and a short press opens the card as it lets go.
  const gridCard = () => (grid && grid.current()) || null
  const hold = menuHold(
    () => (props.preview || !gridCard() ? null : gridCard().raw || null),
    () => gridCard() && openItem(gridCard().raw),
  )
  const onChromeSelect = (id, c) => {
    if (id === 'home') return goHome()
    if (id === 'search') return openKeyboard()
    if (id === 'sort') return openPanel('sort')
    if (id === 'settings') return openPanel('display')
    if (id === 'group') return openPanel('group')
    // The songs grid's Shuffle plays 300 of the library's songs in a random order.
    if (id === 'shuffle') {
      return my.api.getItems({ ParentId: my.parentId, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'Random', Limit: 300, Fields: 'MediaSources,MediaStreams' })
        .then((res) => playQueue(shuffleRouter, (res && res.Items) || [], 0)).catch(() => {})
    }
    if (id === 'show') {
      my.open = 'played'
      return openPanel('sort', false, `filter-played-${my.filters.playedFilter}`)
    }
    if (c.kind === 'letter') return jumpTo(c.letter)
    if (c.kind === 'crumb') {
      my.stack = my.stack.slice(0, c.depth)
      return reload(true)
    }
    if (c.kind === 'tab') {
      my.group = c.tab
      redraw()
      later(() => {
        if (grid) grid.reset()
        toGrid()
      }, 100)
    }
  }
  // A letter jumps to the first item under it, pulling in pages until one turns up or the
  // library runs out.
  const jumpTo = async (letter) => {
    const gen = my.gen
    const find = () => (my.shownItems || []).findIndex((it) => matchesStartLetter(it, letter))
    let i = find()
    while (i < 0 && gen === my.gen && my.fetched < my.total) {
      const before = my.fetched
      await loadPage()
      if (my.fetched === before) break
      i = find()
    }
    if (i < 0 || gen !== my.gen) return
    later(() => {
      my.zone = 'grid'
      focusZone()
      if (grid) grid.focusIndex(i)
    }, 100)
  }

  const openPanel = (which, refresh, focusId) => {
    const f = my.f
    if (!refresh) {
      const cur = chromeRef && chromeRef.current()
      my.opener = cur ? cur.id : 'sort'
    }
    batch(() => {
      st.panel = which
      st.panelNarrow = which !== 'sort'
      st.panelTitle = which === 'sort' ? $L('Sort & Filter') : which === 'display' ? $L('Display') : $L('Group By')
      st.panelRows = rowsFor(which)
    })
    if (!refresh && panelRef) {
      panelRef.reset()
      panelRef.select(focusId || (which === 'sort' ? 'filter-show-alphabet' : which === 'display' ? 'display-scroll-vertical' : `group-by-${f.groupBy}`))
      focusZone()
    }
  }
  const rowsFor = (which) => {
    const f = my.f
    if (which === 'display') {
      return displayPanelRows({
        direction: my.direction, imageType: my.imageType, imageSize: f.imageSize, playlist: f.isPlaylist,
        banner: f.imageType === 'banner', groupingOn: f.groupingOn, playlistTypes: my.playlistTypes,
      })
    }
    if (which === 'group') return groupPanelRows(f.groupBy)
    const libs = my.genreLibraries || []
    // A merged library only offers a filter every server can apply.
    const serverTypes = my.merged && my.serverTypes ? my.serverTypes : [my.serverType || 'jellyfin']
    return sortPanelRows({
      showAlphabet: f.showAlphabet, canFolderView: f.canFolderView, isFolderView: f.isFolderView, sortKeys: f.sortKeys,
      sortKey: f.sortKey, ascending: f.ascending, filters: my.filters, books: false, series: f.isSeries, music: f.music, musicContent: my.musicContent,
      video: !f.isPlaylist && !f.music, onPlex: serverTypes.indexOf('plex') >= 0, serverTypes, facets: my.facets,
      genreMode: !!my.genre, openedGenre: my.musicGenre || null, genreLibraries: libs, parentId: my.parentId,
      genreLibraryName: (libs.find((l) => l.Id === my.parentId) || {}).Name || null,
      open: my.open, facetLimit: my.facetLimit, facetQuery: my.facetQuery, hasFilters: hasActiveFilters(my.filters),
    })
  }
  const refreshPanel = () => {
    if (st.panel) st.panelRows = rowsFor(st.panel)
  }
  // A closed dialog hands focus back to the control that opened it, whatever reloaded behind it.
  const closePanel = () => {
    st.panel = ''
    my.open = null
    my.facetLimit = FACET_PAGE
    my.facetQuery = ''
    my.landing = false
    my.zone = 'chrome'
    if (chromeRef && my.opener) chromeRef.select(my.opener)
    focusZone()
  }
  const saveFilters = (change) => {
    const cur = my.filters
    if (Object.keys(change).every((k) => cur[k] === change[k])) return
    my.filters = { ...cur, ...change }
    saveToStorage(filtersKey(), my.filters)
    reload(false)
    refreshPanel()
  }
  const restyle = () => {
    derive()
    layout()
    redraw()
    refreshPanel()
  }
  const onPanelSelect = (r) => {
    const f = my.f
    if (st.panel === 'group') {
      my.groupByStored = r.value
      saveToStorage(`library_groupBy_${my.key}`, r.value)
      my.group = null
      closePanel()
      reload(false)
      return
    }
    if (st.panel === 'display') {
      if (r.group === 'direction') {
        my.direction = r.value
        saveToStorage(`library_gridDirection_${my.key}`, r.value)
      } else if (r.group === 'image') {
        my.imageType = r.value
        saveToStorage(`library_imageType_${my.key}`, r.value)
      } else if (r.group === 'size') {
        settings.set(f.isPlaylist ? 'playlistPosterSize' : 'libraryPosterSize', r.value)
      } else if (r.group === 'grouping') {
        settings.set('playlistsGroupByType', !f.groupingOn)
      } else if (r.group === 'types') {
        // Unticking the last type would leave nothing on screen and no way back to it.
        const t = my.playlistTypes
        if (t.indexOf(r.value) < 0) my.playlistTypes = t.concat([r.value])
        else if (t.length > 1) my.playlistTypes = t.filter((x) => x !== r.value)
        resolvePlaylists()
      }
      return restyle()
    }
    // Sort & Filter
    if (r.id === 'filter-show-alphabet') {
      settings.set('showAlphabeticalFilters', !f.showAlphabet)
      return restyle()
    }
    if (r.id === 'filter-folder-view') {
      my.folderViewStored = f.isFolderView ? 'off' : 'on'
      saveToStorage(`library_folderView_${my.key}`, my.folderViewStored)
      my.stack = []
      reload(false)
      refreshPanel()
      return
    }
    if (r.kind === 'section') {
      my.facetLimit = FACET_PAGE
      my.facetQuery = ''
      my.open = my.open === r.key ? null : r.key
      refreshPanel()
      if (panelRef) panelRef.select(r.id)
      return
    }
    if (r.kind === 'more') {
      my.facetLimit += FACET_PAGE
      refreshPanel()
      return
    }
    if (r.kind === 'search') return openKeyboard('facet')
    if (r.id === 'filter-clear') {
      my.filters = { ...NO_FILTERS }
      saveToStorage(filtersKey(), my.filters)
      closePanel()
      reload(false)
      return
    }
    if (r.kind === 'clear') {
      if (panelRef) panelRef.select('section-' + r.key)
      return saveFilters({ [FILTER_FIELDS[r.key]]: [] })
    }
    if (r.id.indexOf('sort-option-') === 0) {
      // Picking the sort in use turns it around, and another keeps the direction already picked.
      if (r.value === f.sortKey) my.sortOrder = f.ascending ? 'Descending' : 'Ascending'
      else {
        my.sortKeyStored = r.value
        my.sortOrder = f.ascending ? 'Ascending' : 'Descending'
        saveToStorage(`library_sortKey_${my.key}`, r.value)
      }
      saveToStorage(`library_sortOrder_${my.key}`, my.sortOrder)
      reload(false)
      refreshPanel()
      return
    }
    if (r.id.indexOf('music-content-') === 0) {
      my.musicContent = r.value
      reload(false)
      refreshPanel()
      return
    }
    if (r.id === 'filter-favorites') return saveFilters({ favoritesOnly: !my.filters.favoritesOnly })
    if (r.id.indexOf('filter-played-') === 0) return saveFilters({ playedFilter: r.value })
    if (r.id.indexOf('filter-liked-') === 0) return saveFilters({ likedFilter: r.value })
    if (r.id.indexOf('filter-series-') === 0) return saveFilters({ seriesFilter: r.value })
    if (r.id.indexOf('filter-library-') === 0) {
      my.parentId = r.value || null
      reload(false)
      refreshPanel()
      return
    }
    if (r.kind === 'check' && r.key && FILTER_FIELDS[r.key]) {
      const field = FILTER_FIELDS[r.key]
      const cur = my.filters[field]
      saveFilters({ [field]: cur.indexOf(r.value) >= 0 ? cur.filter((v) => v !== r.value) : cur.concat([r.value]) })
    }
  }

  // Keyboard Style Native hands the search fields to the TV's own keyboard, and any other style opens
  // the in-app keyboard over the screen.
  const openKeyboard = (target) => {
    my.kbTarget = target || 'library'
    const value = my.kbTarget === 'facet' ? my.facetQuery : my.query
    st.keyboard = true
    if (usesNativeKeyboard()) {
      my.kbOverlay = false
      chrome()
      const opened = openNativeInput({
        value,
        rect: fieldRect(),
        onChange: (text) => typed(text),
        onClose: (submitted, key) => {
          closeKeyboard()
          // Up or Down out of the field moves on from it, as the arrows do from a focused input.
          if (key !== 'up' && key !== 'down') return
          if (my.kbTarget === 'facet' && panelRef) panelRef.step(key === 'up' ? -1 : 1)
          else if (chromeRef) chromeRef.move(key)
        },
      })
      if (!opened) closeKeyboard()
      return
    }
    my.kbOverlay = true
    chrome()
    kb.open({ value })
    kb.setFocus()
  }
  // The field's box: the header's search, or the facet search row in the Sort & Filter dialog.
  const fieldRect = () => {
    const r = my.kbTarget === 'facet' && panelRef && panelRef.currentRect()
    if (r) return r
    const c = chromeRef && chromeRef.find('search')
    return c ? { x: c.x, y: c.y, w: c.w, h: c.h } : { x: 760, y: 12, w: 400, h: 66 }
  }
  const closeKeyboard = () => {
    if (!st.keyboard) return
    st.keyboard = false
    chrome()
    focusZone()
  }
  let searchTimer = null
  onCleanup(() => clearTimeout(searchTimer))
  const typed = (next) => {
    if (my.kbTarget === 'facet') {
      my.facetQuery = next
      refreshPanel()
      return
    }
    my.query = next
    redraw()
    // Matching only sees the pages already fetched, so a query that reaches past them pulls
    // the rest in, once typing pauses.
    clearTimeout(searchTimer)
    if (next.trim()) searchTimer = setTimeout(() => loadAll(my.gen).then(() => redraw()), 300)
  }

  const onUp = () => {
    if (st.keyboard || st.panel) return true
    if (my.zone === 'grid') toChrome(aboveGrid())
    else if (my.zone === 'rows') {
      if (my.rowFocus === 0) toChrome(my.f.style === 'docked' ? '@dock' : my.f.style === 'modern' ? '@bar' : '@toolbar')
      else {
        my.rowFocus--
        st.rowsY = rowScroll(my.rowFocus)
        focusZone()
      }
    }
    return true
  }
  const onDown = () => {
    if (st.keyboard || st.panel) return true
    if (my.zone === 'rows' && my.rowFocus < st.groupRows.length - 1) {
      my.rowFocus++
      st.rowsY = rowScroll(my.rowFocus)
      focusZone()
    }
    return true
  }
  const onLeft = () => {
    if (st.keyboard || st.panel) return true
    if ((my.zone === 'grid' || my.zone === 'rows') && my.f && my.f.style === 'docked') toChrome('@dock')
    return true
  }
  const onBack = () => {
    if (st.keyboard) return closeKeyboard() || true
    if (st.panel) return closePanel() || true
    const f = my.f
    if (!f) return router.back() || true
    if (my.zone === 'grid' && f.showLetters) return toChrome('L-#') || true
    if (f.isFolderView && my.stack.length) {
      my.stack = my.stack.slice(0, -1)
      reload(true)
      return true
    }
    if (st.groupRows.length && my.rowFocus > 0) {
      my.rowFocus = 0
      st.rowsY = rowScroll(0)
      my.zone = 'rows'
      focusZone()
      return true
    }
    if (grid && grid.scrolled()) {
      grid.focusIndex(0)
      my.zone = 'grid'
      focusZone()
      return true
    }
    router.back()
    return true
  }

  // The nav's entry follows the library each time it comes back on top.
  if (props.page) {
    createEffect(
      on(props.page.active, (active) => {
        if (active && my.navId) store.navSection = my.navId
      }),
    )
  }

  let unsub = null
  onMount(() => {
    unsub = userDataSync.subscribe(() => redraw())
    setup()
  })
  onCleanup(() => unsub && unsub())
  // When a photo page holds this library, this pages the folder in for its viewer and lands on the
  // photo the viewer closed on.
  if (props.ref) {
    props.ref({
      loadMore: () => my.fetched > 0 && my.fetched < my.total && loadPage(),
      focusItem: (id) => {
        const i = (my.shownItems || []).findIndex((it) => it.Id === id)
        if (i < 0) return
        my.zone = 'grid'
        focusZone()
        if (grid) grid.focusIndex(i)
      },
    })
  }

  return (
    <view
      width={1920}
      height={1080}
      forwardFocus={() => {
        focusZone()
        return true
      }}
      onUp={onUp}
      onDown={onDown}
      onLeft={onLeft}
      onRight={() => true}
      onBack={onBack}
    >
      <view width={1920} height={1080} colorTl="#101010" colorTr="#161616" colorBl="#171717" colorBr="#171717" />
      <view>
        <Show when={backdropLayer()}>
          <BackdropLayer url={st.backdrop} blur={backdropLayer().blur} />
        </Show>
      </view>
      <view>
        <For each={boxes.keys()}>
          {(k) => {
            const b = boxes.item(k)
            return <view x={b().x} y={b().y} width={b().w} height={b().h} borderRadius={b().r || 0} color={b().color} />
          }}
        </For>
      </view>
      <view>
        <For each={texts.keys()}>
          {(k) => {
            const t = texts.item(k)
            return (
              <text
                fontFamily={t().font}
                fontSize={t().size}
                x={t().x}
                y={t().y}
                lineHeight={t().lh}
                maxWidth={t().max || 1746}
                maxLines={1}
                color={t().color}
                letterSpacing={t().spacing || 0}
                textShadow={t().shadow}
              >
                {t().text}
              </text>
            )
          }}
        </For>
      </view>
      <view>
        <Show when={st.infoY >= 0}>
          <FocusedInfo x={st.infoX} y={st.infoY} w={st.infoW} item={st.focusedItem} />
        </Show>
      </view>
      <view x={st.gridX} y={st.viewTop} width={st.gridW} height={st.viewH} clipping>
        <view>
          <For each={st.skeleton}>
            {(sk) => <view x={sk.x} y={sk.y} width={sk.w} height={sk.h} borderRadius={10} color="#ffffff24" />}
          </For>
        </view>
        <view onCaptureEnter={hold.down} onCaptureEnterRelease={hold.up} onMenu={hold.menu}>
          <Show when={gridShown()}>
            <Kept gone={() => (grid = null)}>
              <Grid
                ref={(n) => (grid = n)}
                items={st.cards}
                tile={LibraryTile}
                cols={st.cols}
                tileW={st.tileW}
                tileH={st.tileH}
                viewH={st.viewH}
                viewW={st.gridW}
                opts={st.tileOpts}
                horizontal={st.horizontal}
                slideMs={st.tileOpts.slide}
                held={!!props.preview}
                onGridFocus={onGridFocus}
                onGridSelect={(card) => openItem(card.raw)}
                onGridEnd={() => loadPage()}
              />
            </Kept>
          </Show>
        </view>
      </view>
      <view x={rowsX()} y={st.viewTop} width={1920 - rowsX()} height={1080 - st.viewTop} clipping>
        {/* Sized, so the renderer still draws its rows once it has slid far above the clip. */}
        <view y={st.rowsY} width={1920 - rowsX()} height={rowsH()} transition={{ y: { duration: 220, easing: 'ease-out' } }}>
          <For each={rows.keys()}>
            {(k) => {
              const row = rows.item(k)
              return (
                <Row
                  ref={(n) => (rowRefs[k] = n)}
                  y={row().y}
                  title={row().title}
                  items={row().items}
                  type={row().type}
                  rowKey={k}
                  look="media"
                  onRowFocus={onRowFocus}
                  onRowSelect={(card) => card && openItem(card.raw)}
                />
              )
            }}
          </For>
        </view>
      </view>
      <view>
        <Show when={st.emptyText}>
          <text
            fontFamily={emptyFont}
            fontSize={24}
            x={st.gridX + st.gridW / 2}
            y={st.viewTop + st.viewH / 2 - 14}
            mountX={0.5}
            color="#ffffff80"
          >
            {st.emptyText}
          </text>
        </Show>
      </view>
      <Chrome
        ref={(n) => (chromeRef = n)}
        controls={st.controls}
        onChromeEdge={onChromeEdge}
        onChromeSelect={onChromeSelect}
      />
      <view>
        <Show when={st.panel}>
          <Kept gone={() => (panelRef = null)}>
            <LibraryPanel
              ref={(n) => (panelRef = n)}
              title={st.panelTitle}
              rows={st.panelRows}
              narrow={st.panelNarrow}
              neon={neonOn()}
              onPanelSelect={onPanelSelect}
            />
          </Kept>
        </Show>
      </view>
      <Keyboard
        ref={(n) => (kb = n)}
        overlay
        onKeyboardChange={(text) => typed(text)}
        onKeyboardClose={() => closeKeyboard()}
        onKeyboardNative={() => {
          // The overlay keyboard's style picker chose Native, so the field goes to the TV's keyboard.
          const target = my.kbTarget
          st.keyboard = false
          openKeyboard(target)
        }}
      />
    </view>
  )
}
