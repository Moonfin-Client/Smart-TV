import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, on, onCleanup, onMount, untrack } from 'solid-js'
import Grid from '../../ui/components/Grid.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import Chrome from '../../ui/components/library/Chrome.jsx'
import SidePanel from '../../ui/components/library/SidePanel.jsx'
import FocusedInfo from '../../ui/components/library/FocusedInfo.jsx'
import FavoriteTile from '../../ui/components/library/FavoriteTile.jsx'
import BackdropLayer from '../../ui/components/shell/BackdropLayer.jsx'
import { Kept, keyed, pageTimers } from '../../ui/components/library/pageKit.js'
import { roundButton } from '../../ui/components/library/roundButton.js'
import { colorNum } from '../../ui/components/library/libraryChrome.js'
import { virtualGridLayout } from '../../ui/components/library/tileGridMath.js'
import { focusMs, slideMs } from '../../ui/components/library/motion.js'
import { fontsReady, textWidth } from '../../ui/components/library/measure.js'
import { goHome } from '../../ui/components/library/goHome.js'
import { unifiedMode } from '../../ui/components/library/multiServer.js'
import { fontFor, uiFont } from '../../ui/text.js'
import { theme } from '../../ui/theme.js'
import { legacy } from '../../ui/tier.js'
import { reactive } from '../../state/reactive.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { menuHold } from '../../ui/components/modals/menuHold.js'
import { api, getServerType, getServerUrl } from '../../services/jellyfinApi.js'
import * as connectionPool from '../../services/connectionPool.js'
import { getActiveParentalFilter, withoutBlockedItems } from '../../services/parentalControls.js'
import { getMovie, getTv, getWatchlist } from '../../services/seerrApi.js'
import { checkSeerr } from '../../state/seerr.js'
import mapBounded from '../../utils/mapBounded.js'
import { withoutBlockedOrUnrated } from '../../utils/parentalFilter.js'
import { normalizeMediaItem } from '../../utils/seerrHomeRows.js'
import { hydrateWatchlistItems } from '../../utils/seerrHydration.js'
import { getFromStorage, saveToStorage } from '../../services/storage.js'
import * as userDataSync from '../../services/userDataSync.js'
import { getBackdropId, getImageUrl } from '../../utils/helpers.js'
import { showsWatchedCheck } from '../../utils/playedState.js'
import { GRID_DIRECTIONS, IMAGE_SIZES, IMAGE_TYPES, LETTERS, capitalize, cycleValue, filterByStartLetter } from '../../utils/gridChrome.js'
import {
  ALL_FAVORITE_TABS, FAVORITE_TABS, FAVORITE_TAB_FIELDS, FAVORITE_TAB_PAGE_SIZE, FAVORITE_TAB_TYPES, WATCHLIST_TAB, bucketByTab,
  cardMetrics, currentCard, favoriteCardImage, swapRequestCard, visibleTabs, watchlistCards, withRequestDetail,
} from './favoriteTabs.js'
import { routeForItem } from '../../state/libraryRoutes.js'
import * as settings from '../../state/settings.js'

// The viewer's favorites (/favorites). The Home view puts a tab per kind over the grid with the
// focused card's details and backdrop above it, and the Library view is one grid with a type filter,
// the letter strip and a status line.
const SORT_OPTIONS = [
  { key: 'SortName', field: 'SortName', order: 'Ascending', label: 'Name' },
  { key: 'DateCreated', field: 'DateCreated', order: 'Descending', label: 'Date Added' },
  { key: 'PremiereDate', field: 'PremiereDate', order: 'Descending', label: 'Premiere Date' },
  { key: 'CommunityRating', field: 'CommunityRating', order: 'Descending', label: 'Community Rating' },
  { key: 'CriticRating', field: 'CriticRating', order: 'Descending', label: 'Critic rating' },
  { key: 'DatePlayed', field: 'DatePlayed', order: 'Descending', label: 'Last Played' },
  { key: 'Runtime', field: 'Runtime', order: 'Ascending', label: 'Runtime' },
]
const TYPE_FILTERS = [
  { key: 'all', label: 'All', types: 'Movie,Series,Episode,Person' },
  { key: 'movies', label: 'Movies', types: 'Movie' },
  { key: 'shows', label: 'Shows', types: 'Series' },
  { key: 'episodes', label: 'Episodes', types: 'Episode' },
  { key: 'people', label: 'People', types: 'Person' },
]
const VIEW_STYLES = ['home', 'library']
const VIEW_STYLE_LABELS = { home: 'Home View', library: 'Library View' }
const LIST_FIELDS = 'ProductionYear,ImageTags,OfficialRating,CommunityRating,CriticRating,RunTimeTicks,UserData,SortName'
// Silo's own watchlist of library titles, read whole, 200 at a time.
const SILO_WATCHLIST_PAGE = 200
const SILO_WATCHLIST_MAX = 1000
// Each request card's detail read waits on its own request, so only this many hold the server at once.
const DETAIL_READS = 3

const readSiloWatchlist = async () => {
  const items = []
  for (let start = 0; start < SILO_WATCHLIST_MAX; start += SILO_WATCHLIST_PAGE) {
    const r = await api.getItems({
      Recursive: true, Filters: 'IsInWatchlist', IncludeItemTypes: 'Movie,Series', StartIndex: start, Limit: SILO_WATCHLIST_PAGE,
      Fields: FAVORITE_TAB_FIELDS,
    })
    const page = (r && r.Items) || []
    items.push(...page)
    if (page.length < SILO_WATCHLIST_PAGE) break
  }
  return items
}
const unreadRequests = (body) => Math.max(0, ((body && body.totalResults) || 0) - ((body && body.results && body.results.length) || 0))
// Silo's watchlist lists each title's age rating, so its cards go through the parental filter right
// away, and one with no rating stays out while any rating is blocked.
const requestCardsOf = (items) => withoutBlockedOrUnrated(items.map((item) => (
  item.contentRating ? { ...normalizeMediaItem(item), OfficialRating: item.contentRating } : normalizeMediaItem(item)
)), getActiveParentalFilter())

// Multi server mode sorts the pooled favorites itself.
const clientSideSort = (arr, key) => {
  const opt = SORT_OPTIONS.find((o) => o.key === key) || SORT_OPTIONS[0]
  const asc = opt.order === 'Ascending'
  const str = (a, b) => (asc ? a.localeCompare(b) : b.localeCompare(a))
  const num = (a, b) => (asc ? a - b : b - a)
  return arr.slice().sort((a, b) => {
    switch (key) {
      case 'SortName': return str((a.SortName || a.Name || '').toLowerCase(), (b.SortName || b.Name || '').toLowerCase())
      case 'DateCreated': return str(a.DateCreated || '', b.DateCreated || '')
      case 'PremiereDate': return str(a.PremiereDate || '', b.PremiereDate || '')
      case 'CommunityRating': return num(a.CommunityRating || 0, b.CommunityRating || 0)
      case 'CriticRating': return num(a.CriticRating || 0, b.CriticRating || 0)
      case 'DatePlayed': return str((a.UserData && a.UserData.LastPlayedDate) || '', (b.UserData && b.UserData.LastPlayedDate) || '')
      case 'Runtime': return num(a.RunTimeTicks || 0, b.RunTimeTicks || 0)
      default: return 0
    }
  })
}

// Favorites' sort sheet is roomier than Genres', and the options it isn't on are dimmer.
const FAV_SHEET = { titleGap: 32, labelGap: 16, radioH: 54, restInk: '#ffffffcc' }

export default function Favorites(props) {
  const store = getStore()
  const later = pageTimers()
  const st = reactive({
    controls: [],
    texts: [],
    boxes: [],
    cards: [],
    cols: 1,
    tileW: 0,
    tileH: 0,
    opts: {},
    gridTop: 404,
    viewH: 656,
    horizontal: false,
    home: true,
    tabKey: null,
    focused: null,
    backdrop: '',
    loading: true,
    emptyText: '',
    statusText: '',
    statusCount: '',
    panel: '',
    panelRows: [],
  })
  const my = { zone: 'grid', byKey: {}, counts: {}, fetched: {}, items: [], letter: null, typeKey: 'all', gen: 0 }
  let chromeRef = null
  let grid = null
  let panelRef = null
  const texts = keyed(() => st.texts, (t) => t.k)
  const boxes = keyed(() => st.boxes, (b) => b.k)
  const plainFont = uiFont()
  // The grid is built afresh for each tab.
  const gridKey = () => (st.cards.length ? 'g' + (st.home ? st.tabKey : 'list') : '')
  // The Home view's BackdropLayer, its scrim at 85 percent covering the page whether or not a
  // picture is under it.
  const backdropBlur = createMemo(() => settings.get('backdropBlurHome'))

  const sortOption = () => SORT_OPTIONS.find((o) => o.key === my.sortKey) || SORT_OPTIONS[0]
  const favoritesPage = (types, start, limit, fields) => {
    const opt = sortOption()
    return api.getItems({
      Recursive: true, Filters: 'IsFavorite', IncludeItemTypes: types, SortBy: opt.field, SortOrder: opt.order,
      StartIndex: start, Limit: limit, EnableTotalRecordCount: true, Fields: fields,
    })
  }
  const reload = () => {
    const home = my.view === 'home'
    my.gen++
    // The watchlist loads on its own, so a favorites reload in the same view keeps what it has.
    const keep = home && my.wlView === 'home'
    const wl = WATCHLIST_TAB.key
    my.byKey = keep ? { [wl]: my.byKey[wl] || [] } : {}
    my.counts = keep ? { [wl]: my.counts[wl] || 0 } : {}
    my.fetched = {}
    my.items = []
    my.total = 0
    my.focusedCard = null
    my.landed = false
    my.chromeLanded = false
    batch(() => {
      st.home = home
      st.cards = []
      st.loading = true
      st.focused = null
      st.backdrop = ''
      chrome()
    })
    if (home) {
      loadTabs()
      if (!keep) loadWatchlist()
    } else {
      my.wl = null
      loadList(0)
    }
    my.wlView = my.view
  }
  // One request per kind, fired together, since a favorites query that names no types comes
  // back without any people in it. Multi server mode pools one query from every server.
  const loadTabs = async () => {
    const gen = my.gen
    if (my.unified) {
      const all = await connectionPool.getFavoritesFromAllServers({ includeItemTypes: FAVORITE_TAB_TYPES, fields: FAVORITE_TAB_FIELDS }).catch(() => [])
      if (gen !== my.gen) return
      const pooled = bucketByTab(all)
      FAVORITE_TABS.forEach((tab) => {
        my.byKey[tab.key] = pooled[tab.key]
        my.counts[tab.key] = pooled[tab.key].length
      })
    } else {
      await Promise.all(FAVORITE_TABS.map((tab) => favoritesPage(tab.types, 0, FAVORITE_TAB_PAGE_SIZE, FAVORITE_TAB_FIELDS).then((r) => {
        if (gen !== my.gen) return
        const fetched = (r && r.Items) || []
        my.byKey[tab.key] = withoutBlockedItems(fetched)
        my.fetched[tab.key] = fetched.length
        my.counts[tab.key] = (r && r.TotalRecordCount) || fetched.length
      }).catch((err) => {
        console.error(`Failed to load ${tab.key} favorites:`, err)
        my.byKey[tab.key] = []
        my.counts[tab.key] = 0
      })))
      if (gen !== my.gen) return
    }
    my.total = FAVORITE_TABS.reduce((a, t) => a + (my.counts[t.key] || 0), 0)
    st.loading = false
    tabsChanged()
    land()
  }
  // Keeps the active tab on screen as tabs come and go, else the first one.
  const tabsChanged = () => {
    const tabs = visibleTabs(my.byKey)
    if (!tabs.find((t) => t.key === st.tabKey)) st.tabKey = tabs.length ? tabs[0].key : null
    show()
  }
  // The watchlist loads apart from the favorites, since it reads the requests service too: the
  // library titles on Silo's watchlist, then the requests watchlist as request cards.
  const loadWatchlist = async () => {
    const state0 = (my.wl = { page: 0, totalPages: 0, loading: false })
    if (my.unified) return
    const seerr = await checkSeerr().catch(() => null)
    const requestsReady = !!(seerr && seerr.enabled && seerr.authenticated)
    const [library, first] = await Promise.all([
      getServerType() === 'silo' ? readSiloWatchlist().catch((err) => {
        console.error('Failed to load the Silo watchlist:', err)
        return []
      }) : [],
      requestsReady ? getWatchlist(1).catch((err) => {
        console.error('Failed to load the requests watchlist:', err)
        return null
      }) : null,
    ])
    const requestCards = requestCardsOf(await hydrateWatchlistItems((first && first.results) || []))
    if (my.wl !== state0) return
    const state = { page: (first && first.page) || 0, totalPages: (first && first.totalPages) || 0, loading: false, ready: requestsReady }
    my.wl = state
    const cards = watchlistCards(withoutBlockedItems(library), requestCards)
    my.byKey[WATCHLIST_TAB.key] = cards
    my.counts[WATCHLIST_TAB.key] = cards.length + unreadRequests(first)
    if (!st.loading) {
      tabsChanged()
      land()
    }
    fillRequestCards(cards.filter((card) => card._seerr), state)
  }
  const loadMoreWatchlist = async () => {
    const state = my.wl
    if (!state || !state.ready || state.loading || state.page === 0 || state.page >= state.totalPages) return
    state.loading = true
    try {
      const body = await getWatchlist(state.page + 1)
      const cards = requestCardsOf(await hydrateWatchlistItems((body && body.results) || []))
      if (my.wl !== state) return
      state.page = (body && body.page) || state.page + 1
      if (!cards.length) {
        state.totalPages = state.page
        return
      }
      my.byKey[WATCHLIST_TAB.key] = watchlistCards(my.byKey[WATCHLIST_TAB.key], cards)
      show()
      fillRequestCards(cards, state)
    } catch (err) {
      console.error('Failed to load more of the watchlist:', err)
    } finally {
      state.loading = false
    }
  }
  // A request card carries no backdrop or runtime, so each reads its title's detail and is swapped
  // in as its own arrives. A reload replaces the state, which drops the reads still waiting.
  const fillRequestCards = (cards, state) => mapBounded(cards, DETAIL_READS, async (card) => {
    if (my.wl !== state) return
    const raw = card._seerrRaw || {}
    const details = await (raw.mediaType === 'tv' ? getTv(raw.mediaId) : getMovie(raw.mediaId)).catch(() => null)
    if (!details || my.wl !== state) return
    const filled = withRequestDetail(card, details, normalizeMediaItem({ ...details, mediaType: raw.mediaType }))
    const blocked = withoutBlockedItems([filled]).length === 0
    my.byKey[WATCHLIST_TAB.key] = swapRequestCard(my.byKey[WATCHLIST_TAB.key], filled, blocked)
    if (st.tabKey === WATCHLIST_TAB.key) show()
    else if (blocked) tabsChanged()
  })
  const loadMoreTab = async () => {
    const key = st.tabKey
    if (key === WATCHLIST_TAB.key) return loadMoreWatchlist()
    const tab = FAVORITE_TABS.find((t) => t.key === key)
    if (my.unified || !tab || my.paging || !my.fetched[key] || my.fetched[key] >= (my.counts[key] || 0)) return
    my.paging = true
    const gen = my.gen
    try {
      const r = await favoritesPage(tab.types, my.fetched[key] || 0, FAVORITE_TAB_PAGE_SIZE, FAVORITE_TAB_FIELDS)
      if (gen !== my.gen) return
      const fetched = (r && r.Items) || []
      if (!fetched.length) return
      my.fetched[key] = (my.fetched[key] || 0) + fetched.length
      my.byKey[key] = (my.byKey[key] || []).concat(withoutBlockedItems(fetched))
      show()
    } catch (e) {
      console.error(`Failed to load more ${key} favorites:`, e)
    } finally {
      my.paging = false
    }
  }
  const loadList = async (start) => {
    if (my.paging) return
    my.paging = true
    const gen = my.gen
    const filter = TYPE_FILTERS.find((t) => t.key === my.typeKey) || TYPE_FILTERS[0]
    try {
      if (my.unified) {
        const all = await connectionPool.getFavoritesFromAllServers()
        if (gen !== my.gen) return
        const types = filter.types.split(',')
        my.items = clientSideSort(filter.key === 'all' ? all : all.filter((it) => types.indexOf(it.Type) >= 0), my.sortKey)
        my.total = my.items.length
        my.listFetched = my.total
      } else {
        const r = await favoritesPage(filter.types, start, 150, LIST_FIELDS)
        if (gen !== my.gen) return
        const fetched = (r && r.Items) || []
        my.listFetched = start + fetched.length
        my.items = (start ? my.items : []).concat(withoutBlockedItems(fetched))
        my.total = (r && r.TotalRecordCount) || 0
      }
    } catch (e) {
      console.error('Failed to load favorites:', e)
    } finally {
      my.paging = false
    }
    if (gen !== my.gen) return
    st.loading = false
    show()
    land()
  }
  const cardType = () => {
    if (st.home) return ((ALL_FAVORITE_TABS.find((t) => t.key === st.tabKey) || {}).cardType) || 'portrait'
    return my.imageType === 'thumbnail' ? 'landscape' : 'portrait'
  }
  const shownItems = () => {
    if (st.home) return userDataSync.applyAll(my.byKey[st.tabKey] || [])
    return userDataSync.applyAll(filterByStartLetter(my.items, my.letter))
  }
  // The cards already built, by the item each shows, so a request card filled in or a watched change
  // builds only its own card again. A theme or a face that finished loading builds them all again.
  const built = new WeakMap()
  const show = () => {
    batch(() => {
      const type = cardType()
      const m = cardMetrics(type, my.size)
      const g = virtualGridLayout(1880, m.itemSize.minWidth, m.itemSize.minHeight, 20)
      st.horizontal = my.direction === 'horizontal'
      // The grid's content starts under its own 10px padding: 404 in the Home view, and 157 in the
      // Library view, under the toolbar that ends at 147.
      st.gridTop = st.home ? 404 : 157
      st.viewH = st.home ? 1080 - 404 - 10 : 1080 - 157 - 49 - 10
      st.cols = st.horizontal ? Math.max(1, Math.floor((st.viewH + 20) / (g.itemHeight + 20))) : g.columns
      st.tileW = g.stepX
      st.tileH = g.stepY
      const t = theme()
      st.opts = {
        cardW: g.itemWidth - 20, posterH: m.posterHeight, ms: focusMs(200), slide: slideMs(200),
        watchedBg: t.badgeWatched, onBadge: t.onBadge,
      }
      const server = getServerUrl()
      const items = shownItems()
      // A card filled in after it took focus shows at once, and one that left the list takes the
      // details and backdrop with it.
      if (my.focusedCard) {
        const now = currentCard(my.focusedCard, items)
        if (now !== st.focused) showFocused(now)
      }
      const v = untrack(() => store.settingsVersion)
      st.cards = items.map((it, i) => {
        const was = built.get(it)
        if (was && was.i === i && was.type === type && was.server === server && was.unified === my.unified && was.v === v) return was.card
        const img = favoriteCardImage(it, type)
        const url = img.url || (img.imageId ? getImageUrl(it._serverUrl || server, img.imageId, img.imageType, { maxHeight: 400, quality: 80 }) : '')
        const person = it.Type === 'Person'
        const serverName = my.unified && it._serverName ? it._serverName : ''
        const card = {
          key: it.Id + '-' + i, idx: i, image: url || '', icon: person ? 'lib_person' : 'lib_movie',
          round: type === 'circle' || person, played: showsWatchedCheck(it), raw: it,
          server: serverName, serverFont: fontFor(serverName, 'medium'),
          serverW: serverName ? Math.min(180, Math.ceil(textWidth(serverName, 18, 'medium')) + 20) : 0,
        }
        built.set(it, { i, type, server, unified: my.unified, v, card })
        return card
      })
      st.emptyText = !st.loading && !items.length ? (st.home ? $L('No favorites yet') : $L('No favorites found')) : ''
      if (!st.home) {
        const filter = TYPE_FILTERS.find((x) => x.key === my.typeKey) || TYPE_FILTERS[0]
        st.statusText = $L('{count} favorites sorted by {sortLabel}').replace('{count}', my.total).replace('{sortLabel}', $L(sortOption().label)) +
          (filter.key === 'all' ? '' : ` · ${$L(filter.label)}`)
        st.statusCount = `${items.length} | ${my.total}`
      }
      chrome()
    })
  }
  // The title and count, the round toolbar, the letters in the Library view and the tabs in the Home view.
  const chrome = () => {
    const title = $L('Favorites')
    const count = `${my.total || 0} ${$L('Items')}`
    const tw = textWidth(title, 42, 'bold', -0.5)
    const cw = textWidth(count, 18)
    const x0 = 960 - (tw + 16 + cw) / 2
    const ms = focusMs(200)
    const down = { down: 'out' }
    const controls = [
      roundButton('home', 'lib_home_plain', 48, 81, ms, { next: down }),
      roundButton('sort', 'lib_sort_az', 120, 81, ms, { next: down }),
      roundButton('settings', 'lib_settings_outline', 192, 81, ms, { next: down }),
    ]
    const bx = []
    if (!st.home) {
      let x = 264
      LETTERS.forEach((l, i) => {
        const w = Math.ceil(textWidth(l, 17, 'bold')) + 22 + 2
        const active = my.letter === l
        controls.push({
          id: 'L-' + l, group: 'toolbar', kind: 'letter', letter: l, x: x + (i ? 2 : 0), y: 88, w, h: 38, r: 6, ms: focusMs(150), zoom: 1.1,
          base: active ? '#00a4dc' : '', fill: '#ffffff26', ring: true, ringBorder: { w: 1, color: colorNum('#00a4dc') },
          label: l, lfont: uiFont('bold'), lsize: 17, lx: 12, ly: 9, lh: 21, lmax: w,
          labelOff: active ? '#ffffff' : '#ffffff8c', labelOn: '#ffffff', next: down,
        })
        x += w + (i ? 2 : 0)
      })
    } else {
      const tabs = visibleTabs(my.byKey)
      const t = theme()
      let w = 4
      tabs.forEach((tab) => {
        const label = `${$L(tab.label)}: ${my.counts[tab.key] || 0}`
        const active = tab.key === st.tabKey
        const tw2 = Math.ceil(textWidth(label, 19, active ? 'bold' : 'medium')) + 44 + 6
        controls.push({
          id: 'tab-' + tab.key, group: 'tabs', kind: 'tab', tab: tab.key, x: 48 + w, y: 325, w: tw2, h: 55, r: 27.5, ms: focusMs(120),
          base: active ? t.accent : '', ring: true, ringBorder: { w: 3, color: colorNum(t.focus) },
          label, lfont: uiFont(active ? 'bold' : 'medium'), lsize: 19, lx: 25, ly: 14, lh: 27, lmax: tw2,
          labelOff: active ? t.onAccent : t.os(0.75), labelOn: active ? t.onAccent : t.os(0.75),
          next: { up: 'out', down: 'out' },
        })
        w += tw2
      })
      if (tabs.length) bx.push({ k: 'tabbar', x: 48, y: 321, w: w + 4, h: 63, r: 31.5, color: t.os(0.08) })
    }
    batch(() => {
      st.texts = [
        { k: 'title', text: title, size: 42, font: uiFont('bold'), color: '#ffffff', spacing: -0.5, x: x0, y: 28 },
        { k: 'count', text: count, size: 18, font: uiFont(), color: '#ffffff80', x: x0 + tw + 16, y: 36 },
      ]
      st.controls = controls
      st.boxes = bx
    })
  }
  // Focus goes to the grid the first time it has cards, which can be when the watchlist arrives
  // after empty favorites.
  const land = () => {
    if (my.landed || st.panel) return
    if (st.cards.length) {
      my.landed = true
      my.zone = 'grid'
      later(() => focusZone(), 100)
    } else if (!my.chromeLanded) {
      my.chromeLanded = true
      my.zone = 'chrome'
      if (chromeRef) chromeRef.select('home')
      focusZone()
    }
  }
  const focusZone = () => {
    if (props.page && !props.page.active()) return
    if (st.panel && panelRef) return panelRef.setFocus()
    if (my.zone === 'grid' && grid) return grid.setFocus()
    my.zone = 'chrome'
    if (chromeRef) chromeRef.setFocus()
  }
  const toChrome = (target) => {
    if (!chromeRef) return
    if (target.charAt(0) === '@') chromeRef.selectGroup(target.slice(1))
    else chromeRef.select(target)
    my.zone = 'chrome'
    focusZone()
  }
  const toGrid = () => {
    if (!st.cards.length) return
    my.zone = 'grid'
    focusZone()
  }
  const showFocused = (it) => {
    st.focused = it
    const s = settings.all()
    if (!st.home || legacy || s.showHomeBackdrop === false) {
      st.backdrop = ''
      return
    }
    const id = it && getBackdropId(it)
    st.backdrop = it && it._externalBackdropUrl ? it._externalBackdropUrl : id ? getImageUrl(it._serverUrl || getServerUrl(), id, 'Backdrop', { maxWidth: 1280, quality: 80 }) : ''
  }
  const onGridSelect = (card) => {
    const it = card.raw
    if (it._seerr) {
      // The library id travels with the pick, so a title the server already holds opens as itself.
      const raw = it._seerrRaw || {}
      if (it._seerrLibraryId) return router.to(`/details/${it._seerrLibraryId}`)
      return router.to(`/seerr/item/${raw.mediaType || it._seerrMediaType}/${raw.mediaId}`)
    }
    if (it.Type === 'Person') return router.to(`/person/${it.Id}`)
    const [path, data] = routeForItem(it)
    router.to(path, data)
  }
  // Holding OK on a card opens its menu. A watchlist request card isn't a library item, so it has none.
  const hold = menuHold(
    () => {
      const c = grid && grid.current()
      return c && c.raw && !c.raw._seerr ? c.raw : null
    },
    () => grid && grid.current() && onGridSelect(grid.current()),
  )
  const openPanel = (which) => {
    if (which === 'sort') {
      const rows = [{ kind: 'title', label: st.home ? $L('Sort By') : $L('Sort & Filter') }, { kind: 'label', label: $L('Sort By') }]
      SORT_OPTIONS.forEach((o, i) => rows.push({ kind: 'radio', id: `fav-sort-option-${i}`, value: o.key, label: $L(o.label), selected: my.sortKey === o.key }))
      rows.push({ kind: 'end' })
      if (!st.home) {
        rows.push({ kind: 'label', label: $L('Type') })
        TYPE_FILTERS.forEach((f, i) => rows.push({ kind: 'radio', id: `fav-filter-option-${i}`, value: f.key, label: $L(f.label), selected: my.typeKey === f.key }))
      }
      st.panelRows = rows
    } else {
      const rows = [
        { kind: 'header', label: $L('Favorites') },
        { kind: 'title', label: $L('Settings') },
        { kind: 'setting', id: 'fav-settings-image-size', label: $L('Image size'), value: $L(capitalize(my.size)) },
      ]
      if (!st.home) rows.push({ kind: 'setting', id: 'fav-settings-image-type', label: $L('Image Type'), value: $L(capitalize(my.imageType)) })
      rows.push({ kind: 'setting', id: 'fav-settings-grid-direction', label: $L('Grid direction'), value: $L(capitalize(my.direction)) })
      rows.push({ kind: 'setting', id: 'fav-settings-view-style', label: $L('View style'), value: $L(VIEW_STYLE_LABELS[my.view] || VIEW_STYLE_LABELS.home) })
      st.panelRows = rows
    }
    const keep = st.panel === which
    st.panel = which
    if (!keep) focusZone()
  }
  const closePanel = () => {
    st.panel = ''
    focusZone()
  }
  const onSideSelect = (r) => {
    if (r.id.indexOf('fav-sort-option-') === 0 || r.id.indexOf('fav-filter-option-') === 0) {
      if (r.id.indexOf('fav-sort-option-') === 0) {
        my.sortKey = r.value
        saveToStorage('favorites_sortKey', r.value)
      } else my.typeKey = r.value
      st.panel = ''
      reload()
      later(() => {
        my.zone = 'grid'
        focusZone()
      }, 100)
      return
    }
    if (r.id === 'fav-settings-image-size') {
      my.size = cycleValue(IMAGE_SIZES, my.size)
      saveToStorage('favorites_imageSize', my.size)
    } else if (r.id === 'fav-settings-image-type') {
      my.imageType = cycleValue(IMAGE_TYPES, my.imageType)
      saveToStorage('favorites_imageType', my.imageType)
    } else if (r.id === 'fav-settings-grid-direction') {
      my.direction = cycleValue(GRID_DIRECTIONS, my.direction)
      saveToStorage('favorites_gridDirection', my.direction)
    } else if (r.id === 'fav-settings-view-style') {
      // The whole screen is rebuilt underneath, so the sheet steps out of the way and focus waits
      // on the button that opened it until the new grid can take it.
      my.view = cycleValue(VIEW_STYLES, my.view)
      saveToStorage('favorites_viewStyle', my.view)
      st.panel = ''
      reload()
      my.chromeLanded = true
      toChrome('settings')
      return
    }
    show()
    openPanel('settings')
  }

  if (props.page) {
    createEffect(
      on(props.page.active, (active) => {
        if (active) store.navSection = 'favorites'
      }),
    )
  }
  let unsub = null
  onMount(async () => {
    unsub = userDataSync.subscribe(() => show())
    const stored = await Promise.all(['favorites_sortKey', 'favorites_imageSize', 'favorites_imageType', 'favorites_gridDirection', 'favorites_viewStyle']
      .map((k) => getFromStorage(k).catch(() => null)))
    my.sortKey = stored[0] || 'SortName'
    my.size = stored[1] || 'medium'
    my.imageType = stored[2] || 'poster'
    my.direction = stored[3] || 'vertical'
    my.view = stored[4] || 'home'
    my.unified = await unifiedMode()
    await fontsReady()
    reload()
  })
  onCleanup(() => unsub && unsub())

  return (
    <view
      width={1920}
      height={1080}
      // The grid or the toolbar, whichever the Magic Remote's cursor focuses (app/pointer.js).
      onPointerFocus={(n) => {
        if (st.panel) return true
        for (let p = n; p; p = p.parent) {
          if (p === grid || p === chromeRef) {
            my.zone = p === grid ? 'grid' : 'chrome'
            focusZone()
            return true
          }
        }
        return false
      }}
      forwardFocus={() => {
        focusZone()
        return true
      }}
      onUp={() => {
        if (st.panel) return true
        if (my.zone === 'grid') {
          const tabs = visibleTabs(my.byKey)
          if (st.home && tabs.length) toChrome('tab-' + st.tabKey)
          else if (st.home) toChrome('@toolbar')
          else toChrome('L-#')
        }
        return true
      }}
      onBack={() => {
        if (st.panel) return closePanel() || true
        if (grid && grid.scrolled()) {
          grid.focusIndex(0)
          my.zone = 'grid'
          focusZone()
          return true
        }
        router.back()
        return true
      }}
    >
      <view width={1920} height={1080} colorTl="#101010" colorTr="#161616" colorBl="#171717" colorBr="#171717" />
      <view>
        <Show when={st.home}>
          <BackdropLayer url={st.backdrop} blur={backdropBlur()} overlayOpacity={0.85} />
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
              <text fontFamily={t().font} fontSize={t().size} x={t().x} y={t().y} lineHeight={33} color={t().color} letterSpacing={t().spacing || 0}>
                {t().text}
              </text>
            )
          }}
        </For>
      </view>
      <view>
        <Show when={st.home}>
          <FocusedInfo x={48} y={147} w={1824} variant="hud" item={st.focused} />
        </Show>
      </view>
      <view x={20} y={st.gridTop} width={1880} height={st.viewH} clipping onCaptureEnter={hold.down} onCaptureEnterRelease={hold.up} onMenu={hold.menu}>
        <Show when={gridKey()} keyed>
          {() => (
            <Kept gone={() => (grid = null)}>
              <Grid
                ref={(n) => (grid = n)}
                items={st.cards}
                tile={FavoriteTile}
                cols={st.cols}
                tileW={st.tileW}
                tileH={st.tileH}
                gap={20}
                viewH={st.viewH}
                viewW={1880}
                opts={st.opts}
                horizontal={st.horizontal}
                slideMs={st.opts.slide}
                onGridFocus={(card) => {
                  my.focusedCard = card.raw
                  showFocused(card.raw)
                }}
                onGridEnd={() => {
                  if (st.home) loadMoreTab()
                  else if (my.listFetched < my.total) loadList(my.listFetched)
                }}
                onGridSelect={onGridSelect}
              />
            </Kept>
          )}
        </Show>
      </view>
      <view>
        <Show when={st.loading && !st.cards.length}>
          <Spinner x={928} y={st.gridTop + st.viewH / 2 - 32} size={64} />
        </Show>
      </view>
      <view>
        <Show when={st.emptyText}>
          <text fontFamily={plainFont} fontSize={24} x={960} y={st.gridTop + st.viewH / 2 - 14} mountX={0.5} color="#ffffff80">
            {st.emptyText}
          </text>
        </Show>
      </view>
      <view>
        <Show when={!st.home}>
          <text fontFamily={plainFont} fontSize={14} x={48} y={1037} lineHeight={33} color="#ffffff59">
            {st.statusText}
          </text>
          <text fontFamily={plainFont} fontSize={14} x={1872} y={1037} lineHeight={33} mountX={1} color="#ffffff59">
            {st.statusCount}
          </text>
        </Show>
      </view>
      <Chrome
        ref={(n) => (chromeRef = n)}
        controls={st.controls}
        onChromeEdge={(dir, c) => {
          if (dir === 'down') {
            if (c.group === 'toolbar' && st.home && visibleTabs(my.byKey).length) toChrome('tab-' + st.tabKey)
            else toGrid()
          } else if (dir === 'up' && c.group === 'tabs') toChrome('@toolbar')
          return true
        }}
        // The tab bar selects on focus, so moving along the tabs changes the grid under them.
        onChromeFocus={(id, c) => {
          if (c.kind !== 'tab' || c.tab === st.tabKey) return
          batch(() => {
            st.tabKey = c.tab
            st.focused = null
            st.backdrop = ''
            my.focusedCard = null
            show()
          })
          if (grid) grid.reset()
        }}
        onChromeSelect={(id, c) => {
          if (id === 'home') return goHome()
          if (id === 'sort' || id === 'settings') return openPanel(id)
          if (c.kind === 'tab') return later(() => toGrid(), 100)
          if (c.kind === 'letter') {
            my.letter = my.letter === c.letter ? null : c.letter
            show()
            if (grid) grid.reset()
          }
        }}
      />
      <view>
        <Show when={st.panel}>
          <Kept gone={() => (panelRef = null)}>
            <SidePanel ref={(n) => (panelRef = n)} rows={st.panelRows} metrics={FAV_SHEET} onSideSelect={onSideSelect} />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
