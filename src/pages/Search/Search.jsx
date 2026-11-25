import $L from '../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import Keyboard from '../../ui/components/Keyboard.jsx'
import Spinner from '../../ui/components/Spinner.jsx'
import PillTabs from '../../ui/components/seerr/PillTabs.jsx'
import SearchRow from './SearchRow.jsx'
import SearchGrid from './SearchGrid.jsx'
import { Kept, keyed, pageTimers } from '../../ui/components/library/pageKit.js'
import { uiFont, fontFor, textWidth, cssShift } from '../../ui/text.js'
import { theme, navOnLeft, glowShadow } from '../../ui/theme.js'
import { hex } from '../../ui/color.js'
import { api, getServerUrl, getServerType } from '../../services/jellyfinApi.js'
import * as seerrApi from '../../services/seerrApi.js'
import { getFromStorage, saveToStorage } from '../../services/storage.js'
import { withoutBlockedItems } from '../../services/parentalControls.js'
import {
  groupSearchResults, aspectClassForType, isCircleType, filterByName, fetchAllGames, filterGames, searchLibrary,
} from '../../utils/searchGroups.js'
import { focusScroll, searchArtworkOptions, searchArtworkSource } from './searchWindow.js'
import { getImageUrl } from '../../utils/helpers.js'
import { showsWatchedCheck } from '../../utils/playedState.js'
import { episodeLine } from '../../utils/liveTvGuide.js'
import { isGameLibrary, resolveGameLibraryId } from '../../utils/gameLibrary.js'
import { isKidsMode } from '../../utils/kidsMode.js'
import { closeNativeInput, openNativeInput, usesNativeKeyboard } from '../../ui/components/account/nativeInput.js'
import * as settings from '../../state/settings.js'
import { checkSeerr, seerrState } from '../../state/seerr.js'
import { getStore } from '../../state/store.js'
import { router } from '../../app/router.js'
import { focusNav } from '../../app/focus.js'
import { routeForItem } from '../../state/libraryRoutes.js'
import { relatedCard, gamePath } from '../Games/gameModels.js'
import { openSeerrItem } from '../Seerr/seerrModels.js'
import * as connectionPool from '../../services/connectionPool.js'
import { unifiedMode } from '../../ui/components/library/multiServer.js'
import { hasMergedCopies, mergesLibraries, serverCountOf } from '../../utils/mergedCopies.js'
import { foldForSearch } from '../../utils/accentFolding.js'
import { audio } from '../../state/audioPlayer.js'
import { labelsIdOf } from '../../ui/components/home/cards.js'
import { listenRemoteSearch, pendingRemoteSearch } from './remoteSearch.js'
import { menuHold } from '../../ui/components/modals/menuHold.js'
import { initialCardCount } from '../../utils/rowWindow.js'

// The route isn't kept alive, so coming back from a result opens a fresh Search. Recent searches
// stay on this device.
const SEARCH_DEBOUNCE_MS = 400
const MIN_SEARCH_LENGTH = 2
const GLOBAL_FETCH_LIMIT = 240
const PEOPLE_FETCH_LIMIT = 24
const PEOPLE_GRACE_MS = 1000
const SEERR_CAP = 24
const RECENT_SEARCHES_KEY = 'search_recentQueries'
const RECENT_SEARCHES_MAX = 10
const SMART_SEARCH_DEBOUNCE_MS = 600
const SMART_SEARCH_LIMIT = 20

const FIELD = { w: 656, h: 78, y: 140 }
// The top nav's music pill pushes the page down from 80 to 188.
const MUSIC_BAR_OFFSET = 108
// The caret blinks on a 1.06 second cycle.
const CARET_BLINK_MS = 530
const TABS_Y = 268
const CONTENT_Y = 355
const GRID_Y = 383
const ROW_GAP = 40
const CARD_GAP = 20
const CHIPS_Y = 365

const withinGrace = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))])

const jellyfinSubtitle = (item) => {
  switch (item.Type) {
    case 'Episode':
      return `${item.SeriesName || ''} S${item.ParentIndexNumber != null ? item.ParentIndexNumber : '?'}E${item.IndexNumber != null ? item.IndexNumber : '?'}`
    case 'Program':
      return episodeLine(item) || item.ProductionYear || ''
    case 'Person':
      return $L('Person')
    case 'MusicArtist':
    case 'AlbumArtist':
      return $L('Artist')
    case 'MusicAlbum':
      return item.AlbumArtist || item.ProductionYear || ''
    case 'Audio':
      return item.AlbumArtist || (item.Artists && item.Artists[0]) || item.Album || ''
    default:
      return item.ProductionYear || ''
  }
}

// The card shapes, the art's box with its 3px frame.
const SHAPES = {
  poster: { w: 157, imgH: 157 * 1.5 + 6 },
  wide: { w: 218, imgH: 218 * 0.5625 + 6 },
  square: { w: 218, imgH: 218 + 6 },
}

// The title line is 8 + 33 + 2 and the subtitle another 33, but an empty subtitle takes no room.
const finishCard = (card, idx) => {
  card.idx = idx
  card.h = card.imgH + (card.subtitle ? 76 : 43)
  return card
}

// The server a result came from in unified mode, its text 180 wide at most, unless several servers
// hold it, which the merged badge counts instead.
const serverBadgeOf = (item, unified) => {
  const name = unified && item._serverName && !hasMergedCopies(item) ? item._serverName : ''
  return { serverName: name, serverW: name ? Math.min(180, Math.ceil(textWidth(name, 18, 'medium'))) + 20 : 0, serverFont: name ? fontFor(name, 'medium') : '' }
}

const jellyfinCard = (item, idx, serverUrl, watchedColor, ctx) => {
  const aspect = aspectClassForType(item.Type)
  const shape = SHAPES[aspect]
  const art = searchArtworkSource(item)
  const title = item.Name || ''
  const subtitle = String(jellyfinSubtitle(item))
  const watched = showsWatchedCheck(item)
  const badge = serverBadgeOf(item, ctx.unified)
  const servers = serverCountOf(item)
  return finishCard({
    key: `j-${item.Id}`,
    kind: 'jellyfin',
    w: shape.w,
    imgH: shape.imgH,
    circle: isCircleType(item.Type),
    image: (art && getImageUrl(item._serverUrl || serverUrl, art.id, art.type, searchArtworkOptions(aspect, art.tag))) || '',
    placeholder: isCircleType(item.Type) ? 'person' : 'movie',
    title,
    titleFont: fontFor(title, 'bold'),
    subtitle,
    subtitleFont: fontFor(subtitle),
    watched,
    watchedColor,
    ...badge,
    servers: servers > 1 ? String(servers) : '',
    serversW: servers > 1 ? 9 + 18 + 4 + Math.ceil(textWidth(String(servers), 18, 'bold')) + 9 : 0,
    // Poster labels keep clear of the watched check or the server badge.
    labelsId: labelsIdOf(item, ctx.settings, item._serverUrl || serverUrl),
    labelsTop: 8,
    labelsTopRight: watched || badge.serverName ? 40 : 8,
    labelsBottom: 8,
    raw: item,
  }, idx)
}

const seerrYearOf = (item) => {
  const d = item.releaseDate || item.firstAirDate
  return d ? String(new Date(d).getFullYear()) : ''
}

const seerrCard = (item, idx) => {
  const title = item.title || item.name || ''
  const subtitle = seerrYearOf(item)
  return finishCard({
    key: `s-${item.mediaType}-${item.id}`,
    kind: 'seerr',
    w: SHAPES.poster.w,
    imgH: SHAPES.poster.imgH,
    image: item.posterPath ? seerrApi.getImageUrl(item.posterPath, 'w300') : '',
    placeholder: item.mediaType === 'movie' ? 'movie' : 'tv',
    title,
    titleFont: fontFor(title, 'bold'),
    subtitle,
    subtitleFont: fontFor(subtitle),
    raw: item,
  }, idx)
}

const gameCard = (game, idx) => {
  const card = relatedCard(resolveGameLibraryId(game._library), game, null)
  card.key = `g-${game.id}-${idx}`
  card.kind = 'game'
  card.idx = idx
  return card
}

const cardsFor = (kind, items, serverUrl, watchedColor, ctx) =>
  items.map((it, i) => (kind === 'seerr' ? seerrCard(it, i) : kind === 'game' ? gameCard(it, i) : jellyfinCard(it, i, serverUrl, watchedColor, ctx)))

// A game card carries a 12px margin all round, inside the row's 20px gap.
const stepOf = (card) => (card.kind === 'game' ? card.w + 24 + CARD_GAP : card.w + CARD_GAP)

export default function Search(props) {
  const store = getStore()
  const later = pageTimers()
  const [query, setQuery] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [groups, setGroups] = createSignal([])
  const [seerrResults, setSeerrResults] = createSignal([])
  const [gameResults, setGameResults] = createSignal([])
  // How many cards each row has built, as {rowKey: count}.
  const [grown, setGrown] = createSignal({})
  const [smartItems, setSmartItems] = createSignal([])
  const [smartSeerr, setSmartSeerr] = createSignal([])
  const [activeTab, setActiveTab] = createSignal('all')
  const [zone, setZoneSig] = createSignal('field')
  const [rowIndex, setRowIndex] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [recent, setRecent] = createSignal([])
  const [recentCur, setRecentCur] = createSignal(0)
  const [kbOpen, setKbOpen] = createSignal(false)
  const [nativeOpen, setNativeOpen] = createSignal(false)
  const [unified, setUnified] = createSignal(false)
  const [caretOn, setCaretOn] = createSignal(true)
  const placeholder = $L('Search movies, shows, music, and more...')
  const clearLabel = $L('Clear')
  const clearW = Math.round(textWidth(clearLabel, 16) + 42)
  const font = uiFont()
  const boldFont = uiFont('bold')
  const shift18 = cssShift(18)
  const shift24 = cssShift(24)
  const shift28 = cssShift(28)
  const my = { req: 0, smartReq: 0, gameLibs: [], hasLiveTv: false, names: [], remote: null, onRequests: false }
  let self = null
  let kb = null
  let tabsRef = null
  let gridRef = null
  const rowRefs = {}
  // The result card focus is on, for the menu a held OK opens.
  let heldCard = null

  const t = () => theme()
  const left = () => (navOnLeft() ? 78 : 0)
  // Music playing behind the screens hangs its pill under the top nav, so the page starts lower.
  const musicTop = () => (audio.active && !navOnLeft() ? MUSIC_BAR_OFFSET : 0)
  const cardCtx = createMemo(() => ({ unified: unified(), settings: settings.all() }))
  const middle = () => left() + (1920 - left()) / 2
  const fieldX = () => middle() - FIELD.w / 2
  const fieldLit = () => zone() === 'field' || zone() === 'voice' || kbOpen() || nativeOpen()
  const seerrLabel = () => seerrState().displayName || $L('Seerr')
  const totalCount = () =>
    groups().reduce((sum, g) => sum + g.items.length, 0) + seerrResults().length + gameResults().length + smartItems().length + smartSeerr().length
  const hasResults = () => totalCount() > 0
  const tabs = createMemo(() => {
    const list = []
    if (seerrResults().length) list.push({ id: 'seerr', label: `${seerrLabel()}: ${seerrResults().length}` })
    if (gameResults().length) list.push({ id: 'games', label: `${$L('Games')}: ${gameResults().length}` })
    list.push({ id: 'all', label: `${$L('All')}: ${totalCount()}` })
    groups().forEach((g) => list.push({ id: g.key, label: `${g.title}: ${g.items.length}` }))
    return list
  })
  // The All tab: Smart Search first, then the type groups, then Seerr, then games.
  const rows = createMemo(() => {
    const raw = []
    if (smartItems().length) raw.push({ id: 'smart', title: $L('Smart Search'), items: smartItems(), kind: 'jellyfin' })
    if (smartSeerr().length) {
      raw.push({ id: 'smartSeerr', title: $L('Smart Search on {name}').replace('{name}', seerrLabel()), items: smartSeerr(), kind: 'seerr' })
    }
    groups().forEach((g) => raw.push({ id: g.key, title: g.title, items: g.items, kind: 'jellyfin' }))
    if (seerrResults().length) raw.push({ id: 'seerr', title: seerrLabel(), items: seerrResults(), kind: 'seerr' })
    if (gameResults().length) raw.push({ id: 'games', title: $L('Games'), items: gameResults(), kind: 'game' })
    const serverUrl = getServerUrl()
    const watched = t().badgeWatched
    const ctx = cardCtx()
    const lft = left()
    return raw.map((r, i) => {
      const cards = cardsFor(r.kind, r.items, serverUrl, watched, ctx)
      let x = 0
      let cardH = 0
      // A row is as tall as the tallest card it has built, so hs[n - 1] is its height with n built.
      const hs = []
      cards.forEach((c) => {
        c.x = x + (c.kind === 'game' ? 12 : 0)
        x += stepOf(c)
        cardH = Math.max(cardH, c.kind === 'game' ? c.h + 24 : c.h)
        hs.push(107 + cardH)
      })
      const h = 107 + cardH
      // An unmounted row holds its place with one hidden card of its first item's shape, whose
      // title and subtitle are both a blank line.
      const shape = r.kind === 'jellyfin' ? SHAPES[aspectClassForType(r.items[0] && r.items[0].Type)] : SHAPES.poster
      return {
        key: r.id,
        i,
        h,
        hs,
        ph: r.kind === 'game' ? h : 107 + shape.imgH + 76,
        kind: r.kind,
        cards,
        contentW: Math.max(0, x - CARD_GAP),
        title: r.title,
        titleFont: fontFor(r.title, 'bold'),
        count: ` (${r.items.length})`,
        countFont: uiFont(),
        countX: lft + 60 + textWidth(r.title, 22, 'bold'),
      }
    })
  })
  // Where each row starts, with the rows near focus at their own height and the rest at their
  // placeholder's.
  const activeRow = () => Math.min(rowIndex(), Math.max(0, rows().length - 1))
  const rowHeights = createMemo(() => {
    const g = grown()
    return rows().map((r) => r.hs[(g[r.key] || initialCardCount(r.cards.length)) - 1] || 107)
  })
  const rowTops = createMemo(() => {
    const active = activeRow()
    const heights = rowHeights()
    let y = CONTENT_Y
    return rows().map((r) => {
      const top = y
      y += (Math.abs(r.i - active) <= 1 ? heights[r.i] : r.ph) + ROW_GAP
      return top
    })
  })
  const grid = createMemo(() => {
    let kind = 'jellyfin'
    let items = null
    if (activeTab() === 'seerr') {
      kind = 'seerr'
      items = seerrResults()
    } else if (activeTab() === 'games') {
      kind = 'game'
      items = gameResults()
    } else {
      const group = groups().find((g) => g.key === activeTab())
      items = group ? group.items : null
    }
    if (!items) return null
    const cards = cardsFor(kind, items, getServerUrl(), t().badgeWatched, cardCtx())
    const lft = left()
    const cellW = (cards[0] ? cards[0].w : 157) + CARD_GAP
    const columns = Math.max(1, Math.floor((1920 - lft - 120 + CARD_GAP) / cellW))
    // Each wrapped line is as tall as its tallest card, 30 apart.
    let y = GRID_Y
    for (let at = 0; at < cards.length; at += columns) {
      const line = cards.slice(at, at + columns)
      const lineH = line.reduce((m, c) => Math.max(m, c.h), 0)
      line.forEach((c, i) => {
        c.x = lft + 60 + i * cellW
        c.y = y
      })
      y += lineH + 30
    }
    return { key: `${activeTab()}-${cards.length}`, kind, cards, columns, bottom: y - 30 }
  })
  const gridShown = () => (hasResults() && activeTab() !== 'all' && grid() ? grid().key : '')
  const rowList = () => (hasResults() && activeTab() === 'all' ? rows() : [])
  const rowsKeyed = keyed(rowList, (r) => r.key)
  const showRecent = () => !hasResults() && !loading() && query().trim().length < MIN_SEARCH_LENGTH && recent().length > 0
  const contentH = () => {
    if (gridShown()) return musicTop() + grid().bottom + 28 + 60
    const list = rowList()
    const last = list[list.length - 1]
    if (!last) return 1080
    return musicTop() + rowTops()[last.i] + (Math.abs(last.i - activeRow()) <= 1 ? rowHeights()[last.i] : last.ph) + ROW_GAP + 60
  }
  const message = createMemo(() => {
    if (hasResults() || showRecent()) return null
    if (loading()) return null
    if (query().trim().length < MIN_SEARCH_LENGTH) {
      return { k: 'empty', title: $L('Search for content'), sub: $L('Find movies, TV shows, music, and more'), y: 454 }
    }
    return { k: 'none', title: $L('No results found'), sub: $L('Try a different search term'), y: 348 }
  })
  const recentChips = createMemo(() => {
    if (!showRecent()) return []
    const maxRight = 1920 - 100
    const start = left() + 100
    let x = start
    let y = CHIPS_Y
    return recent().map((term, i) => {
      const tw = textWidth(term, 18)
      const w = Math.min(maxRight - start, Math.round(tw + 50))
      if (x + w > maxRight && x > start) {
        x = start
        y += 59
      }
      // The text keeps its own width unless the chip had to stop at the edge, since a chip rounded
      // down by a fraction would otherwise cut its last letter.
      const chip = { term, i, x, y, w, max: Math.min(Math.ceil(tw) + 1, w - 50), font: fontFor(term) }
      x += w + 12
      return chip
    })
  })
  const chipFocused = (i) => zone() === 'recent' && recentCur() === i
  const clearFocused = () => zone() === 'recent' && recentCur() === -1
  const valueText = () => query() || (kbOpen() || nativeOpen() ? '' : placeholder)
  const caretShown = () => (kbOpen() || nativeOpen()) && !!query()
  // The theme's focus glow, as CSS box-shadows laid out for the renderer's shadow.
  const focusGlow = createMemo(() => (t().focusGlow || []).map((g) => glowShadow(g).shadow))

  let blink = null
  createEffect(
    on(caretShown, (shown) => {
      clearInterval(blink)
      setCaretOn(true)
      if (shown) blink = setInterval(() => setCaretOn(!caretOn()), CARET_BLINK_MS)
    }),
  )
  onCleanup(() => clearInterval(blink))

  const focusZone = () => {
    if (props.page && !props.page.active()) return
    if (kbOpen()) return kb && kb.setFocus()
    if (zone() === 'tabs' && hasResults() && tabsRef) return tabsRef.setFocus()
    if (zone() === 'content' && hasResults()) {
      const row = rows()[rowIndex()]
      const el = activeTab() === 'all' ? row && rowRefs[row.key] : gridRef
      if (el) return el.setFocus()
    }
    if (zone() === 'recent' && !showRecent()) setZoneSig('field')
    if (zone() !== 'voice' && zone() !== 'recent') setZoneSig('field')
    if (self) self.setFocus()
  }
  const setZone = (z) => {
    setZoneSig(z)
    focusZone()
  }
  // Where leaving the field downward lands, which is also where the keyboard hands focus when
  // it's dismissed upward. False when there is nothing below the field yet.
  const focusBelowInput = () => {
    if (hasResults()) {
      focusAllTab()
      return true
    }
    if (showRecent()) {
      setRecentCur(0)
      setZone('recent')
      return true
    }
    return false
  }
  // The All pill itself, or the Requests pill this search landed on.
  const focusAllTab = () => {
    const want = my.onRequests ? 'seerr' : 'all'
    focusTab(tabs().some((tb) => tb.id === want) ? want : 'all')
  }
  // With expanded tabs, the pill focus lands on is the one picked.
  const focusTab = (id) => {
    if (tabsRef) tabsRef.select(id)
    onTabSelect(id)
    setZoneSig('tabs')
    revealY(TABS_Y, TABS_Y + 63)
    focusZone()
  }
  // Down from the microphone, or out of the TV's keyboard, lands on the pill nearest under the
  // button or the field.
  const tabUnder = (x) => {
    const placed = (tabsRef && tabsRef.placed()) || []
    const cx = fieldX() + x - (left() + 60) + ((tabsRef && tabsRef.shift()) || 0)
    let best = null
    let gap = Infinity
    placed.forEach((tab) => {
      const d = cx < tab.x ? tab.x - cx : cx > tab.x + tab.w ? cx - tab.x - tab.w : 0
      if (d < gap) {
        gap = d
        best = tab
      }
    })
    return best ? best.id : 'all'
  }
  const focusContent = () => {
    if (activeTab() === 'all') {
      keepLayout()
      setRowIndex(0)
    }
    setZoneSig('content')
    focusZone()
  }
  const revealY = (contentTop, contentBottom) => {
    setScroll(focusScroll(scroll(), contentTop + musicTop(), contentBottom + musicTop(), contentH()))
  }

  let debounce = null
  let smartDebounce = null
  onCleanup(() => {
    clearTimeout(debounce)
    clearTimeout(smartDebounce)
  })
  const applyQuery = (value) => {
    // Even a clear or a query waiting for debounce supersedes older results.
    my.req++
    my.smartReq++
    setQuery(value)
    clearTimeout(debounce)
    debounce = setTimeout(() => doSearch(value), SEARCH_DEBOUNCE_MS)
    clearTimeout(smartDebounce)
    smartDebounce = setTimeout(() => runSmartSearch(value), SMART_SEARCH_DEBOUNCE_MS)
  }
  const clearResults = () => {
    batch(() => {
      setGroups([])
      setSeerrResults([])
      setGameResults([])
      setGrown({})
      setRowIndex(0)
      setScroll(0)
    })
  }
  const doSearch = async (text) => {
    const id = ++my.req
    my.onRequests = false
    const q = (text || '').trim()
    if (q.length < MIN_SEARCH_LENGTH) {
      setLoading(false)
      clearResults()
      if (zone() === 'tabs' || zone() === 'content') setZone('field')
      return
    }
    const isStudioQuery = q.toLowerCase().indexOf('studio:') === 0
    const s = settings.all()
    setLoading(true)
    try {
      const uni = await unifiedMode()
      if (id !== my.req) return
      // With merged libraries a title several servers hold is one result.
      const foldsCopies = mergesLibraries(s, uni)
      // A people search that fails leaves the other results alone.
      const peoplePromise = Promise.resolve()
        .then(() => (uni
          ? connectionPool.searchPeopleAllServers(q, PEOPLE_FETCH_LIMIT)
          : api.searchPeople(q, PEOPLE_FETCH_LIMIT).then((r) => (r && r.Items) || [])))
        .then(withoutBlockedItems)
        .catch(() => [])
      const [library, channels] = await Promise.all([
        uni
          ? connectionPool.searchAllServers(q, GLOBAL_FETCH_LIMIT, { foldCopies: foldsCopies }).then((found) => ({ Items: found }))
          : searchLibrary(api, q, GLOBAL_FETCH_LIMIT, getServerType()),
        my.hasLiveTv && !isStudioQuery
          ? api.getLiveTvChannels(0, 500).then((r) => (r && r.Items) || []).catch(() => [])
          : Promise.resolve([]),
      ])
      if (id !== my.req) return
      const items = withoutBlockedItems(library.Items || []).concat(filterByName(channels, q))
      // With nothing else to show, the results wait for people instead of coming up empty.
      const people = items.length ? await withinGrace(peoplePromise, PEOPLE_GRACE_MS) : await peoplePromise
      if (id !== my.req) return
      // The keyboard's suggestions come from these names, so blocked titles stay out of both.
      const showResults = (found) => {
        const all = items.concat(found)
        my.names = all.map((result) => result.Name).filter(Boolean)
        setGroups(groupSearchResults(all))
      }
      batch(() => {
        setUnified(uni)
        showResults(people || [])
        setGrown({})
        setRowIndex(0)
        setScroll(0)
        setLoading(false)
        // A new query always starts on All.
        setActiveTab('all')
      })
      if (people === null) {
        peoplePromise.then((found) => {
          if (found.length && id === my.req) showResults(found)
        })
      }
      remember(q)
      // Focus goes to the All tab unless a keyboard has the field.
      if (!kbOpen() && !nativeOpen()) later(() => hasResults() && !remoteActive() && focusAllTab(), 50)
      // Seerr and games load after the library results so the rows appear first.
      if (!isStudioQuery && !isKidsMode(s)) addSeerr(q, id)
      else setSeerrResults([])
      if (my.gameLibs.length && !isStudioQuery) {
        if (!my.allGames) my.allGames = await fetchAllGames(my.gameLibs)
        if (id !== my.req) return
        setGameResults(filterGames(my.allGames, q))
      } else {
        setGameResults([])
      }
    } catch (e) {
      if (id !== my.req) return
      console.error('[search] failed', e)
      clearResults()
      setLoading(false)
    }
  }
  const addSeerr = async (q, id) => {
    const seerr = await checkSeerr()
    if (!seerr.available || id !== my.req) {
      if (id === my.req) setSeerrResults([])
      return
    }
    try {
      const res = await seerrApi.search(q)
      if (id !== my.req) return
      const found = ((res && res.results) || []).filter((r) => r.mediaType !== 'person').slice(0, SEERR_CAP)
      setSeerrResults(found)
      if (props.preferRequests && found.length) {
        // Requests arrive after the rest, so the search moves over to them unless another tab was picked.
        my.onRequests = true
        if (activeTab() === 'all') setActiveTab('seerr')
        if (zone() === 'tabs' && !remoteActive()) later(() => focusAllTab(), 0)
      }
    } catch (e) {
      console.error('[search] Seerr search failed', e)
    }
  }
  // A single word is a title or a name, which the normal search handles, so only queries of two
  // words or more go to Moonbase.
  const runSmartSearch = (text) => {
    clearTimeout(smartDebounce)
    const id = ++my.smartReq
    const q = (text || '').trim()
    const s = settings.all()
    const info = seerrState().pluginInfo
    const enabled = !!s.useMoonfinPlugin && !!info && info.smartSearchEnabled === true
    const none = () => {
      setSmartItems([])
      setSmartSeerr([])
    }
    if (!enabled || q.split(/\s+/).length < 2 || q.toLowerCase().indexOf('studio:') === 0) return none()
    api.smartSearch(q, SMART_SEARCH_LIMIT).then((res) => {
      if (id !== my.smartReq) return
      if (!res || res.Ready !== true) return none()
      batch(() => {
        setSmartItems(withoutBlockedItems(res.Items || []))
        setSmartSeerr(seerrState().enabled && !isKidsMode(s) ? res.Seerr || [] : [])
      })
    }).catch(() => {
      if (id === my.smartReq) none()
    })
  }
  // Recorded once a search returns, so the half-typed prefixes never reach the list.
  const remember = (q) => {
    const lower = q.toLowerCase()
    const next = [q].concat(recent().filter((term) => term.toLowerCase() !== lower)).slice(0, RECENT_SEARCHES_MAX)
    setRecent(next)
    saveToStorage(RECENT_SEARCHES_KEY, next)
  }
  // Picking a past query runs it straight away, there is no typing left to wait for.
  const runRecent = (term) => {
    closeRemote()
    clearTimeout(debounce)
    setQuery(term)
    doSearch(term)
    runSmartSearch(term)
  }
  const clearRecent = () => {
    setRecent([])
    saveToStorage(RECENT_SEARCHES_KEY, [])
    setZone('field')
  }

  let exitedTop = false
  const openKeyboard = () => {
    if (usesNativeKeyboard()) return openNative()
    setKbOpen(true)
    exitedTop = false
    kb.open({
      value: query(),
      purpose: 'search',
      recents: recent(),
      suggestionsBuilder: (text) => suggestionsFor(text),
      onExitTop: () => {
        setKbOpen(false)
        const moved = focusBelowInput()
        setKbOpen(!moved)
        exitedTop = moved
        return moved
      },
    })
    kb.setFocus()
  }
  // The TV's own keyboard, which is also where the remote's microphone lives.
  const openNative = () => {
    setNativeOpen(true)
    const opened = openNativeInput({
      value: query(),
      rect: { x: fieldX(), y: FIELD.y + musicTop(), w: FIELD.w, h: FIELD.h },
      onChange: (text) => {
        closeRemote()
        applyQuery(text)
      },
      onClose: (submitted, key) => {
        setNativeOpen(false)
        if (submitted) runSmartSearch(query())
        if (key === 'down' && hasResults()) return focusTab(tabUnder(FIELD.w / 2))
        if (key === 'down' && focusBelowInput()) return
        setZone('field')
      },
    })
    if (!opened) setNativeOpen(false)
  }
  // Titles for the keyboard's suggestion chips, out of the results already on screen.
  const suggestionsFor = (text) => {
    const typed = foldForSearch(text.trim())
    if (!typed) return []
    return my.names.filter((name) => foldForSearch(name).indexOf(typed) >= 0)
  }

  // A phone's search: its text replaces the query as it arrives, with focus left on the field.
  const attachRemote = (search) => {
    if (search === my.remote) return
    closeRemote()
    my.remote = search
    if (!search || !search.active) return
    search.attach((text) => {
      // The keyboard's old text is dropped before the phone edits.
      if (kbOpen() && kb) kb.close(false)
      if (nativeOpen()) closeNativeInput()
      applyQuery(text)
    })
    setZone('field')
  }
  const remoteActive = () => !!(my.remote && my.remote.active)
  const closeRemote = () => {
    if (my.remote) my.remote.close()
  }

  const onTabSelect = (id) => {
    if (id === activeTab()) return
    batch(() => {
      setActiveTab(id)
      setRowIndex(0)
      setScroll(Math.max(0, Math.min(scroll(), Math.max(0, contentH() - 1080))))
    })
  }
  // A move between rows scrolls against the old layout, and the rows settle into the new window
  // after.
  let oldLayout = null
  const keepLayout = () => {
    oldLayout = { tops: rowTops(), contentH: contentH() }
  }
  const onRowFocus = (index, cardIndex) => {
    const old = oldLayout
    oldLayout = null
    setRowIndex(index)
    const row = rows()[index]
    const card = row && row.cards[cardIndex]
    heldCard = card || null
    if (!card) return
    const top = (old ? old.tops : rowTops())[index] + 77
    setScroll(focusScroll(scroll(), top + musicTop(), top + card.h + musicTop(), old ? old.contentH : contentH()))
  }
  const openCard = (card) => {
    if (card.kind === 'seerr') return openSeerrItem(router, card.raw)
    if (card.kind === 'game') {
      const game = card.raw
      return router.to(gamePath(resolveGameLibraryId(game._library), game.id), { game })
    }
    const [path, data] = routeForItem(card.raw)
    router.to(path, data)
  }
  // Holding OK on a library result opens its menu. A Seerr or game result has none.
  const hold = menuHold(
    () => (heldCard && heldCard.kind === 'jellyfin' ? heldCard.raw : null),
    () => heldCard && openCard(heldCard),
  )
  const navLeft = () => navOnLeft() && focusNav()
  const firstLine = () => recentChips().filter((c) => c.y === CHIPS_Y)

  onMount(async () => {
    store.navSection = 'search'
    my.stopRemote = listenRemoteSearch((search) => attachRemote(search))
    attachRemote(pendingRemoteSearch())
    focusZone()
    const stored = await getFromStorage(RECENT_SEARCHES_KEY).catch(() => null)
    if (Array.isArray(stored)) setRecent(stored)
    // Game and Live TV libraries widen what a search looks through.
    try {
      const views = await api.getLibraries()
      const libs = (views && views.Items) || []
      my.gameLibs = libs
        .filter((lib) => isGameLibrary(lib.Id, lib.CollectionType, lib.Name))
        .map((lib) => ({ ...lib, Id: resolveGameLibraryId(lib) }))
      my.hasLiveTv = libs.some((lib) => lib.CollectionType === 'livetv')
    } catch (e) {
      // A search still runs without them.
    }
  })
  onCleanup(() => {
    // Keeps answers that land after the screen closed from touching it.
    my.req++
    my.smartReq++
    if (my.stopRemote) my.stopRemote()
    if (my.remote) my.remote.close()
  })

  const onUp = () => {
    if (zone() === 'content') {
      if (activeTab() === 'all' && rowIndex() > 0) {
        keepLayout()
        setRowIndex(rowIndex() - 1)
        focusZone()
        return true
      }
      focusAllTab()
      return true
    }
    if (zone() === 'tabs') return setZone('field') || true
    if (zone() === 'recent') {
      if (recentCur() === -1) return setZone('field') || true
      const chip = recentChips()[recentCur()]
      const above = recentChips().filter((c) => c.y < chip.y)
      setRecentCur(above.length ? above[above.length - 1].i : -1)
      return true
    }
    if (!navOnLeft()) focusNav()
    return true
  }
  const onDown = () => {
    // With results, Down from the field goes past the tabs into the content, picking the All pill
    // on the way.
    if (zone() === 'field' && hasResults()) {
      focusAllTab()
      focusContent()
      return true
    }
    if (zone() === 'voice' && hasResults()) return focusTab(tabUnder(606)) || true
    if (zone() === 'field' || zone() === 'voice') return focusBelowInput() || true
    if (zone() === 'tabs') return focusContent() || true
    if (zone() === 'content' && activeTab() === 'all' && rowIndex() < rows().length - 1) {
      keepLayout()
      setRowIndex(rowIndex() + 1)
      focusZone()
      return true
    }
    if (zone() === 'recent') {
      if (recentCur() === -1) {
        const first = firstLine()
        setRecentCur(first.length ? first[first.length - 1].i : 0)
        return true
      }
      const chip = recentChips()[recentCur()]
      const below = recentChips().find((c) => c.y > chip.y)
      if (below) setRecentCur(below.i)
    }
    return true
  }
  const onLeft = () => {
    if (zone() === 'voice') return setZone('field') || true
    if (zone() === 'recent') {
      if (recentCur() > 0) setRecentCur(recentCur() - 1)
      else if (recentCur() === -1) setRecentCur(Math.max(0, firstLine().length - 1))
      else navLeft()
      return true
    }
    navLeft()
    return true
  }
  const onRight = () => {
    if (zone() === 'field') setZone('voice')
    else if (zone() === 'recent' && recentCur() >= 0 && recentCur() < recent().length - 1) setRecentCur(recentCur() + 1)
    return true
  }
  const onEnter = () => {
    if (zone() === 'field') openKeyboard()
    else if (zone() === 'voice') openNative()
    else if (zone() === 'recent') {
      if (recentCur() === -1) clearRecent()
      else {
        const term = recent()[recentCur()]
        if (term) runRecent(term)
      }
    }
    return true
  }

  return (
    <view
      width={1920}
      height={1080}
      color="#0a0a0a"
      forwardFocus={() => {
        store.navSection = 'search'
        focusZone()
        return true
      }}
      onUp={onUp}
      onDown={onDown}
      onLeft={onLeft}
      onRight={onRight}
      onEnter={onEnter}
    >
      {/* Sized to the content, so the renderer keeps drawing it however far it scrolls. */}
      <view y={musicTop() - scroll()} width={1920} height={Math.max(1080, contentH())}>
        <PillTabs
          ref={(n) => (tabsRef = n)}
          x={left() + 60}
          y={TABS_Y}
          tabs={tabs()}
          activeId={activeTab()}
          expanded
          maxW={1920 - left() - 120}
          alpha={hasResults() ? 1 : 0}
          onTabSelect={onTabSelect}
        />
        <view onCaptureEnter={hold.down} onCaptureEnterRelease={hold.up} onMenu={hold.menu}>
          <For each={rowsKeyed.keys()}>
            {(k) => {
              const row = rowsKeyed.item(k)
              return (
                <SearchRow
                  ref={(n) => (rowRefs[k] = n)}
                  y={rowTops()[row().i]}
                  row={row()}
                  rowIndex={row().i}
                  mounted={Math.abs(row().i - activeRow()) <= 1}
                  left={left()}
                  grownCount={grown()[k] || 0}
                  onRowFocus={onRowFocus}
                  onRowGrow={(key, count) => setGrown({ ...untrack(grown), [key]: count })}
                  onRowSelect={(ri, ci) => {
                    const r = rows()[ri]
                    const card = r && r.cards[ci]
                    if (card) openCard(card)
                  }}
                />
              )
            }}
          </For>
        </view>
        <view onCaptureEnter={hold.down} onCaptureEnterRelease={hold.up} onMenu={hold.menu}>
          <Show when={gridShown()} keyed>
            {() => (
              <Kept gone={() => (gridRef = null)}>
                <SearchGrid
                  ref={(n) => (gridRef = n)}
                  grid={grid()}
                  onGridFocus={(index) => {
                    const card = grid() && grid().cards[index]
                    heldCard = card || null
                    if (card) revealY(card.y, card.y + card.h)
                  }}
                  onGridSelect={(index) => {
                    const card = grid() && grid().cards[index]
                    if (card) openCard(card)
                  }}
                />
              </Kept>
            )}
          </Show>
        </view>
      </view>

      <view y={musicTop()}>
        <view>
          <Show when={message() && message().k === 'empty'}>
            <view x={middle() - 46} y={348} width={80} height={80} src="icons/search.webp" color="#ffffff4d" />
          </Show>
        </view>
        <view>
          <Show when={message()}>
            <view y={message().y}>
              <text fontFamily={boldFont} fontSize={28} lineHeight={33} x={middle()} y={shift28} mountX={0.5} color="#ffffffe6">
                {message().title}
              </text>
              <text fontFamily={font} fontSize={18} lineHeight={33} x={middle()} y={43 + shift18} mountX={0.5} color="#ffffff99">
                {message().sub}
              </text>
            </view>
          </Show>
        </view>
        <view>
          <Show when={loading() && !hasResults()}>
            <Spinner x={middle() - 36} y={348} size={72} />
            <text fontFamily={font} fontSize={18} lineHeight={33} x={middle()} y={440 + shift18} mountX={0.5} color="#ffffffb3">
              {$L('Searching...')}
            </text>
          </Show>
        </view>
        <view>
          <Show when={showRecent()}>
            <text fontFamily={boldFont} fontSize={24} lineHeight={33} x={left() + 100} y={310 + shift24} color="#ffffffe6">
              {$L('Recent Searches')}
            </text>
            <view x={1820 - clearW} y={308} width={clearW} height={37} borderRadius={6} color={clearFocused() ? '#00a4dc' : '#00a4dc00'}>
              <text fontFamily={font} fontSize={16} x={21} y={9} color={clearFocused() ? '#ffffffe6' : '#ffffff99'}>
                {clearLabel}
              </text>
            </view>
          </Show>
        </view>
        <view>
          <For each={recentChips()}>
            {(chip) => (
              <view
                x={chip.x}
                y={chip.y}
                width={chip.w}
                height={47}
                borderRadius={24}
                color={chipFocused(chip.i) ? '#00a4dc' : '#ffffff1a'}
                border={{ width: 1, color: hex(chipFocused(chip.i) ? '#00a4dc' : '#ffffff26') }}
              >
                <text fontFamily={chip.font} fontSize={18} x={25} y={13} maxWidth={chip.max} maxLines={1} color="#ffffffe6">
                  {chip.term}
                </text>
              </view>
            )}
          </For>
        </view>
      </view>
      <view x={left()} y={80 + musicTop()} width={1920 - left()} height={168} colorTop="#0a0a0afa" colorBottom="#0a0a0a00" />
      <view ref={(n) => (self = n)} x={fieldX()} y={FIELD.y + musicTop()}>
        <view>
          <For each={focusGlow()}>
            {(g) => <view width={FIELD.w} height={FIELD.h} borderRadius={FIELD.h / 2} color="#0a0a0aff" shadow={g} alpha={fieldLit() ? 1 : 0} />}
          </For>
        </view>
        <view
          width={FIELD.w}
          height={FIELD.h}
          borderRadius={39}
          color={fieldLit() ? t().inputFocused : t().inputBackground}
          border={{ width: 4, color: hex(fieldLit() ? t().focus : t().inputBorder) }}
        />
        <view x={28} y={27} width={24} height={24} src="icons/search.webp" color="#ffffff99" />
        <text
          fontFamily={query() ? fontFor(query()) : font}
          fontSize={24}
          lineHeight={33}
          x={64}
          y={22 + shift24}
          maxWidth={query() ? 483 : 512}
          maxLines={1}
          color={query() ? '#ffffff' : '#ffffff80'}
        >
          {valueText()}
        </text>
        <view>
          <Show when={caretShown()}>
            <view x={64 + textWidth(query(), 24)} y={24.6} width={2} height={28.8} color={t().focus} alpha={caretOn() ? 1 : 0} />
          </Show>
        </view>
        <view>
          <Show when={query()}>
            <text fontFamily={font} fontSize={24} lineHeight={24} x={555} y={27 + shift24} color="#ffffff99">
              ×
            </text>
          </Show>
        </view>
        <view
          x={584}
          y={17}
          width={44}
          height={44}
          borderRadius={22}
          color={zone() === 'voice' ? t().inputFocused : '#ffffff00'}
          border={{ width: 3, color: hex(zone() === 'voice' ? t().focus : '#ffffff00') }}
        >
          <view x={9} y={9} width={26} height={26} src="icons/mic.webp" color={zone() === 'voice' ? '#ffffff' : '#ffffff99'} />
        </view>
      </view>

      <Keyboard
        ref={(n) => (kb = n)}
        overlay
        onKeyboardChange={(text) => {
          closeRemote()
          applyQuery(text)
        }}
        onKeyboardClose={(submitted) => {
          setKbOpen(false)
          if (submitted) runSmartSearch(query())
          // Leaving through the top has already put focus where the screen wanted it.
          if (exitedTop) {
            exitedTop = false
            return focusZone()
          }
          setZone('field')
        }}
        onKeyboardNative={() => {
          setKbOpen(false)
          openNative()
        }}
      />
    </view>
  )
}
