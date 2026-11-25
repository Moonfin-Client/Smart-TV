import $L from '../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import { Dynamic, getRenderer } from '@solidtv/solid'
import { barComponent } from '../ui/components/home/bars.js'
import BackdropLayer from '../ui/components/shell/BackdropLayer.jsx'
import HomeRows from '../ui/components/home/HomeRows.jsx'
import DetailSection from '../ui/components/home/DetailSection.jsx'
import HomeSkeleton, { skeletonBoxes } from '../ui/components/home/HomeSkeleton.jsx'
import WatchPartyAlert from '../ui/components/home/WatchPartyAlert.jsx'
import { shapeWatchingRow, watchingRowBox } from '../ui/components/home/WatchingNowRow.jsx'
import { ALERT_MS, alertOf, createPartyRooms, partiesEnabled, partyRowOf } from '../ui/components/home/partyRooms.js'
import { barEnabled, featuredKey, loadFeaturedItems } from '../ui/components/home/featured.js'
import { homeLook, placeholderCard, rowBox } from '../ui/components/home/look.js'
import { shapeRow } from '../ui/components/home/cards.js'
import { shapeTileRow, tileRowBox } from '../ui/components/home/tileCards.js'
import { rowPeekHeight } from '../ui/components/home/rowPeek.js'
import { onScreen } from '../ui/components/home/onScreen.js'
import { createCardPreview } from '../ui/components/home/cardPreview.js'
import { setNavFeatured } from '../ui/components/nav/navEntries.js'
import { uiFont } from '../ui/text.js'
import { homeRowsKey, isExternalItem, loadHomeSection, pageRow, placeholderRow, planHomeRows, serverLibraries } from '../state/homeRows.js'
import * as cache from '../state/browseCache.js'
import * as storage from '../services/storage.js'
import { playRoute, routeForItem, routeForLibrary } from '../state/libraryRoutes.js'
import { menuOptions } from '../ui/components/modals/menuHold.js'
import { getStore, toast } from '../state/store.js'
import * as settings from '../state/settings.js'
import { holdScreensaver } from '../state/shell/idle.js'
import { shell, shellApp } from '../state/shell/shellState.js'
import * as seerrApi from '../services/seerrApi.js'
import { api, getApiKey, getServerUrl, getUserId } from '../services/jellyfinApi.js'
import * as gamesApi from '../services/gamesApi.js'
import { mediaPreviewAllowedOnDevice } from '../services/mediaPreviewSource.js'
import { getDeviceCapabilities } from '../services/deviceProfile.js'
import { bestSearchMatch } from '../utils/seerrTarget.js'
import { openSeerrShortcut } from './Seerr/seerrModels.js'
import { mediaPreviewMode } from '../utils/mediaPreviewMode.js'
import { getPlatform, isLegacyTizen } from '../platform.js'
import { isLiveTvProgram } from '../utils/liveTvLibrary.js'
import { getBackdropId, getBackdropTag, getImageUrl } from '../utils/helpers.js'
import { homeBackdropStyle } from '../utils/homeBackdropStyle.js'
import { isSiloServer } from '../utils/siloUrls.js'
import { markHomeReady } from '../utils/homeReady.js'
import { router } from '../app/router.js'
import { focusNav } from '../app/focus.js'
import { afterDraw } from '../ui/afterDraw.js'

// Home has two modes: the media bar filling the screen, and the rows. Down from the bar shows the
// rows, Up from the first row shows the bar again, and the swap is instant. The rows sit in a band
// below the bar while it's up, where only a row peek, the Banner bar or the Aya frame leave room to
// see them. While the bar's trailer shows, the backdrop and the page fill go clear so the video
// under the canvas shows through.

cache.setCacheStorage(storage)

// The first eight sections load with Home and the rest as focus comes near them.
const EAGER_SECTIONS = 8
const NEAR_ROWS_ABOVE = 2
const NEAR_ROWS_BELOW = 5
// The sections built before loading ends.
const FIRST_PHASE = { resume: true, nextup: true, 'continue-nextup': true, 'library-tiles': true, librarybuttons: true, livetv: true }
// What refreshVolatileData and refreshRecentRows read again.
const VOLATILE = { resume: true, nextup: true, 'continue-nextup': true, onnow: true }
const RECENT = { 'latest-media': true, 'recently-released': true }
// Rows the load just read aren't read again when Home first shows.
const LOAD_FRESH_MS = 10000
// Classic rows hand the focused title to the backdrop once focus stops moving.
const BACKDROP_SETTLE_MS = 250
const SETTINGS_DEBOUNCE_MS = 400

// Each row's cards for the look they were built in, so a section landing doesn't rebuild every row.
const shapedRows = new WeakMap()

// Whether a row read again holds what it held. Functions (a row's readHead) don't count.
const sameRow = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch (e) {
    return false
  }
}

// The backdrop a focused title shows behind the rows.
const backdropFor = (it) => {
  if (!it) return ''
  if (it._externalBackdropUrl) return it._externalBackdropUrl
  if (it.isGame) return gamesApi.gameThumbUrl(it._library && it._library.Id, it.id, 'snap') || ''
  const target = it.Type === 'Genre' && it._representative ? it._representative : it
  const id = getBackdropId(target)
  return id ? getImageUrl(target._serverUrl || getServerUrl(), id, 'Backdrop', { maxWidth: 1280, quality: 80, tag: getBackdropTag(target) }) : ''
}

export default function Home(props) {
  const store = getStore()
  const page = props.page
  const [rows, setRows] = createSignal([])
  const [mode, setMode] = createSignal(barEnabled() ? 'bar' : 'rows')
  const [featured, setFeatured] = createSignal([])
  const [barStyle, setBarStyle] = createSignal(settings.get('featuredBarStyle') || 'moonfin')
  const [loading, setLoading] = createSignal(true)
  const [backItem, setBackItem] = createSignal(null)
  const [trailerOn, setTrailerOn] = createSignal(false)
  const [hole, setHole] = createSignal(null)
  // The card whose preview plays ('rowKey|cardKey'), and its art's rect cleared for it.
  const [previewKey, setPreviewKey] = createSignal('')
  const [cardHole, setCardHole] = createSignal(null)
  // Watch Parties: the rooms for the row that goes first, and the alert for one that just started.
  const [partyRooms, setPartyRooms] = createSignal([])
  const [partyAlert, setPartyAlert] = createSignal(null)
  let root
  let bar
  let list
  let detail
  let slots = []
  let ctx = null
  let gen = 0
  let rowsKey
  let barKey
  let paging = {}
  let touched = false
  let stale = false
  let backTimer = null
  const active = () => (page ? page.active() : true)

  const s = createMemo(() => settings.all())
  const look = createMemo(() => homeLook(s()))
  const partyRow = createMemo(() => (partyRooms().length && partiesEnabled() ? partyRowOf(partyRooms(), look(), store.serverType === 'jellyfin') : null))
  const shaped = createMemo(() => {
    const L = look()
    const st = s()
    const party = partyRow() ? [partyRow()] : []
    return party.concat(
      rows().map((r) => {
        const kept = shapedRows.get(r)
        if (kept && kept.look === L) return kept.row
        const tiles = r.isTileRow || r.isGameRow
        const watching = r.isWatchingNowRow
        const row = tiles ? shapeTileRow(r, L, st) : watching ? shapeWatchingRow(r, L, st) : r.isPlaceholder ? { ...r, cards: [], seeAll: null } : shapeRow(r, L, st)
        row.box = tiles ? tileRowBox(row, st) : watching ? watchingRowBox(row, L) : rowBox(row, L, st)
        shapedRows.set(r, { look: L, row })
        return row
      }),
    )
  })
  // The first row's title and the top half of its cards along the bottom of the bar.
  const rowPeek = createMemo(() => {
    const first = shaped()[0]
    if (mode() !== 'bar' || !barEnabled() || !featured().length || !first) return 0
    return rowPeekHeight({ ...s(), featuredBarStyle: barStyle() }, { ...first, type: first.type === 'poster' ? 'portrait' : first.type })
  })
  // Where the rows band sits: under the navbar's clip edge in rows mode, below the bar while it's
  // up, or along the bottom of the bar as a peek.
  const band = createMemo(
    () => {
      const L = look()
      const left = L.left
      if (mode() === 'rows') {
        // Under Classic's info area the rows start below it, and with the top bar keep its 130px clearance.
        if (L.overlay) return { y: 461, h: 619, padTop: left ? 0 : 130, pin: left ? 0 : 20 }
        const y = left ? 42 : 130
        return { y, h: 1080 - y, padTop: 0, pin: 0 }
      }
      if (rowPeek()) return { y: 1080 - rowPeek(), h: rowPeek(), padTop: 0, pin: 0 }
      if (barStyle() === 'banner') return { y: 556, h: 524, padTop: 0, pin: 0 }
      if (barStyle() === 'aya') {
        const y = left ? 766 : 856
        return { y, h: 1080 - y, padTop: 0, pin: 40 }
      }
      return { y: 1080, h: 1080, padTop: 0, pin: 40 }
    },
    undefined,
    { equals: (a, b) => a.y === b.y && a.h === b.h && a.padTop === b.padTop && a.pin === b.pin },
  )
  const firstMargin = () => (mode() === 'bar' && (rowPeek() || barStyle() === 'banner') ? 0 : 40)
  // Every bar but Aya clears the page for its trailer. Aya's plays in its frame, so the page keeps
  // its backdrop and leaves only the frame's rounded rect clear, drawn as four bands around it.
  const bgClear = () => trailerOn() && !hole() && !cardHole()
  const bgBands = createMemo(() => {
    const h = hole() || cardHole()
    if (!h) return [{ k: 'all', x: 0, y: 0, w: 1920, h: 1080 }]
    return [
      { k: 'all', x: 0, y: 0, w: 1920, h: h.y },
      { k: 'b', x: 0, y: h.y + h.h, w: 1920, h: 1080 - h.y - h.h },
      { k: 'l', x: 0, y: h.y, w: h.x, h: h.h },
      { k: 'r', x: h.x + h.w, y: h.y, w: 1920 - h.x - h.w, h: h.h },
    ]
  })
  // The hole's rounded corners, in the page color under the scrim.
  const holeCorners = createMemo(() => {
    const h = hole() || cardHole()
    if (!h) return []
    const r = h.r || 18
    return [
      { k: 'tl', x: h.x, y: h.y, hx: 0, hy: 0 },
      { k: 'tr', x: h.x + h.w - r, y: h.y, hx: -r, hy: 0 },
      { k: 'bl', x: h.x, y: h.y + h.h - r, hx: 0, hy: -r },
      { k: 'br', x: h.x + h.w - r, y: h.y + h.h - r, hx: -r, hy: -r },
    ].map((c) => ({ ...c, r, shader: ['holePunch', { x: c.hx, y: c.hy, w: r * 2, h: r * 2, radius: r }] }))
  })
  const rowsAlpha = () => (rowPeek() && trailerOn() ? 0 : 1)
  const showRows = () => !loading() && shaped().length > 0
  const empty = () => mode() === 'rows' && !loading() && !rows().length
  const skeleton = createMemo(() => {
    if (!loading()) return null
    const L = look()
    const card = placeholderCard(L, s(), 'portrait')
    return skeletonBoxes({ style: L.style, top: L.left ? 0 : 130, inset: L.inset, cardW: card.w, cardH: card.h, spacing: L.spacing, carousel: L.style === 'carousel' })
  })
  // No backdrop while the bar is up, except behind the Aya frame, which floats in the page.
  const backdrop = () => {
    if (mode() === 'bar' && barStyle() !== 'aya') return ''
    if (s().showHomeBackdrop === false) return ''
    return backdropFor(backItem())
  }
  const placement = () => homeBackdropStyle(s())
  const bg = () => look().background.slice(0, 7)

  const owner = () => ({ serverUrl: getServerUrl(), userId: getUserId() })
  const loadedRows = () => {
    const out = []
    slots.forEach((slot) => slot.loaded && slot.rows.forEach((r) => out.push(r)))
    return out
  }
  // Every loader writes Home's rows to the memory cache, and the stored copy follows.
  const remember = () => {
    cache.memoryCache.rowData = loadedRows()
    cache.memoryCache.timestamp = Date.now()
    cache.saveBrowseCache(cache.memoryCache.rowData, cache.memoryCache.libraries || [], cache.memoryCache.featuredItems, owner())
  }

  const focusZone = () => {
    if (mode() === 'bar' && bar) bar.setFocus()
    else if (list) list.setFocus()
  }

  const showBar = (items) => {
    batch(() => {
      setBarStyle(settings.get('featuredBarStyle') || 'moonfin')
      setFeatured(items || [])
    })
    // Mosaic's Home tile takes its art from the bar's titles.
    setNavFeatured(items || [])
    if (!(items && items.length) && mode() === 'bar') {
      setMode('rows')
      if (active()) focusZone()
    }
  }
  const fetchFreshFeatured = async (fallback = null) => {
    const key = cache.featuredConfigKey(settings.all())
    const mem = cache.memoryCache
    // The bar already holds a set for these settings, and a new random draw would only reshuffle it.
    if (mem.featuredItems && mem.featuredItems.length && mem.featuredConfigKey === key) return null
    const publishBar = (items) => {
      mem.featuredItems = items
      mem.featuredConfigKey = key
      showBar(items)
    }
    let items = []
    try {
      items = await loadFeaturedItems()
    } catch (e) {
      console.warn('[home] media bar failed', e)
    }
    if (items.length) {
      publishBar(items)
      return items
    }
    if (fallback && fallback.length) {
      publishBar(fallback)
      return fallback
    }
    showBar([])
    return null
  }
  // Items already remembered show on the spot, and a fresh draw only follows if the bar's settings changed.
  const primeFeatured = async (remembered, rememberedKey) => {
    if (remembered && remembered.length) {
      cache.memoryCache.featuredItems = remembered
      cache.memoryCache.featuredConfigKey = rememberedKey
      showBar(remembered)
      fetchFreshFeatured(remembered)
      return
    }
    await fetchFreshFeatured(remembered)
  }
  const loadBar = () => {
    barKey = featuredKey()
    if (!barEnabled()) {
      showBar([])
      return Promise.resolve()
    }
    return primeFeatured(cache.memoryCache.featuredItems, cache.memoryCache.featuredConfigKey)
  }
  // A new random set, drawn while the current one stays up and kept if the draw fails.
  let drawing = false
  const redrawMediaBar = async () => {
    if (drawing || !barEnabled()) return
    drawing = true
    const current = cache.memoryCache.featuredItems
    cache.memoryCache.featuredItems = null
    try {
      if (!(await fetchFreshFeatured(current))) cache.memoryCache.featuredItems = current
    } finally {
      drawing = false
    }
  }

  // Every section holds its place from the start with its title over placeholder cards, the ones
  // held back too, except a section known to come back empty, and gives way to the rows it has.
  const publish = () => {
    const before = list && rows()[list.cur()]
    const out = []
    // Two rows under one key would make the rows list hand each its props in turn without end, so
    // a repeat (the same server saved twice) is left out.
    const seen = {}
    const add = (r) => {
      if (seen[r.key]) return
      seen[r.key] = true
      out.push(r)
    }
    slots.forEach((slot) => {
      if (slot.loaded) slot.rows.forEach(add)
      else if (!cache.isEmptySection(slot.section.id)) add(slot.placeholder)
    })
    setRows(out)
    // Focus follows its row as others land above it, but stays on the first row until the viewer moves.
    if (list && before && touched) {
      const at = out.findIndex((r) => r.key === before.key)
      if (at >= 0 && at !== list.cur()) list.focusRow(at)
    } else if (list && !touched && list.focused()) {
      const first = out.findIndex((r) => !r.isPlaceholder)
      if (first >= 0 && first < list.cur()) list.focusRow(first)
    }
  }
  // Each section fills its own slot as it arrives, so a slow one only holds up its own rows.
  const loadSlots = (due, g) =>
    Promise.all(
      due.map((slot) => {
        slot.started = true
        return loadHomeSection(slot.section, ctx).then((got) => {
          if (g !== gen) return
          slot.loaded = true
          slot.rows = got.map((r) => ({ ...r, _section: slot.section.id }))
          cache.settleSections([slot.section.id], slot.rows)
          publish()
          remember()
        })
      }),
    )
  const restore = (rowData) => {
    slots.forEach((slot) => {
      slot.started = true
      slot.loaded = true
      slot.rows = (rowData || []).filter((r) => r._section === slot.section.id)
    })
    publish()
  }

  // Plans the sections and fills them from a cache that answers, or reads the first phase. Gives
  // back the bar's remembered items and what to do once the bar has been asked for: after a read,
  // the eager sections still to load, after a stored copy the refreshes it's due. A read hands
  // `startBar` the bar's remembered items as it starts, so the bar is asked for alongside it.
  let loadFetchedVolatile = 0
  const loadRows = async (startBar) => {
    const g = ++gen
    rowsKey = homeRowsKey()
    const planned = planHomeRows(serverLibraries() || store.libraries || [])
    ctx = planned.ctx
    paging = {}
    slots = planned.sections.map((section) => ({ section, rows: [], started: false, loaded: false, placeholder: placeholderRow(section, ctx) }))
    const st = settings.all()
    const key = cache.rowConfigKey(st)
    const mem = cache.memoryCache
    if (!cache.hasDynamicRowConfig(st)) {
      if (mem.rowConfigKey === key && mem.rowData && mem.libraries && mem.featuredItems && cache.isCacheValid(mem.timestamp, cache.CACHE_TTL_VOLATILE)) {
        restore(mem.rowData)
        return { g, featured: [mem.featuredItems, mem.featuredConfigKey] }
      }
      // Silo's artwork is signed and only known once its item is read in this session, so stored
      // rows would come back without pictures.
      const { serverUrl, userId } = owner()
      const stored = isSiloServer(serverUrl) ? null : await cache.loadBrowseCache(serverUrl, userId)
      if (g !== gen) return { g }
      const valid =
        stored &&
        (stored.rowConfigKey || 'per-library') === key &&
        cache.isCacheValid(stored.timestamp, cache.CACHE_TTL_LIBRARIES) &&
        Array.isArray(stored.libraries) &&
        stored.libraries.length > 0
      if (valid) {
        restore(stored.rowData)
        mem.libraries = stored.libraries
        mem.rowData = loadedRows()
        mem.timestamp = stored.timestamp
        // Rows stored before the recent rows had an age of their own go by when they were written.
        mem.recentAt = stored.recentAt || stored.timestamp
        mem.rowConfigKey = key
        return {
          g,
          featured: [stored.featuredItems, stored.featuredConfigKey],
          after: () => {
            if (!cache.isCacheValid(mem.recentAt, cache.CACHE_TTL_LIBRARIES)) refreshRecentRows()
            if (!cache.isCacheValid(stored.timestamp, cache.CACHE_TTL_VOLATILE)) {
              refreshVolatileData(true)
              loadFetchedVolatile = Date.now()
            }
          },
        }
      }
    }
    mem.rowConfigKey = key
    mem.libraries = serverLibraries() || store.libraries || []
    const storedRows = mem.emptySectionsSeeded ? null : cache.loadBrowseCache(owner().serverUrl, owner().userId)
    const reading = loadSlots(
      slots.filter((slot) => FIRST_PHASE[slot.section.id]),
      g,
    )
    if (startBar) startBar([mem.featuredItems, mem.featuredConfigKey])
    if (storedRows) cache.seedEmptySections(slots.map((slot) => slot.section.id), await storedRows)
    if (g !== gen) return { g }
    publish()
    await reading
    if (g !== gen) return { g }
    mem.recentAt = Date.now()
    loadFetchedVolatile = Date.now()
    const rest = slots.slice(0, EAGER_SECTIONS).filter((slot) => !slot.started)
    // Publishes once more, so a reload whose sections all came back empty clears the old rows.
    return { g, featured: [mem.featuredItems, mem.featuredConfigKey], after: () => loadSlots(rest, g).then(() => g === gen && publish()) }
  }

  // Loading clears once both the bar's titles and the first phase's rows are in, or the first rows
  // when there's no bar. The bar is asked for alongside those rows rather than after.
  const load = async () => {
    setLoading(true)
    setMode(barEnabled() ? 'bar' : 'rows')
    // Signing in as someone else throws the rows away. An ordinary load keeps them.
    const who = `${getApiKey()}:${getUserId()}`
    if (cache.memoryCache.owner !== who) {
      cache.clearMemoryCache()
      cache.resetEmptySections()
      cache.memoryCache.owner = who
    }
    let barRead
    const startBar = (featured) => {
      if (barRead !== undefined) return
      barKey = featuredKey()
      barRead = barEnabled() ? primeFeatured(featured[0], featured[1]) : (showBar([]), null)
    }
    try {
      const got = await loadRows(startBar)
      if (got.g !== gen) return
      startBar(got.featured)
      // The other sections load alongside the bar.
      if (got.after) got.after()
      if (mode() === 'bar') await barRead
    } catch (e) {
      console.warn('[home] load failed', e)
    }
    // The bar is built and asks for its art in one frame, unseen behind the skeleton, and the rows
    // build in the next, so their build doesn't hold up the bar's first picture.
    // shortcut: this calls requestAnimationFrame from a page. Move it behind src/platform if a
    // target lacks it.
    if (mode() === 'bar') await new Promise((resolve) => requestAnimationFrame(resolve))
    setLoading(false)
    markHomeReady()
    // An overlay opened while Home loaded (who's watching, an update, a message) keeps focus, and
    // Home gets it back when the overlay closes.
    if (active()) setTimeout(() => !(shellApp() && shellApp().overlay) && focusZone(), 0)
  }

  const applySettings = (now) => {
    const rowsChanged = homeRowsKey() !== rowsKey
    const barChanged = featuredKey() !== barKey
    if (!rowsChanged && !barChanged) return
    // A hidden Home would build rows nobody sees, so it waits to be shown.
    if (!now && !onScreen(root)) {
      stale = true
      return
    }
    stale = false
    // A bar switched on comes in above the rows, reached with Up, so focus never moves under the viewer.
    if (barChanged) loadBar()
    if (rowsChanged) loadRows().then((got) => got.after && got.g === gen && got.after())
  }

  // Continue Watching, Next Up and On Now read again as Home shows (refreshVolatileData), and the
  // recent rows once they're older than the stored copy may be (refreshRecentRows). A failed read
  // leaves the rows as they were.
  let lastVolatile = 0
  let lastRecent = 0
  const reloadSections = (pick) => {
    const due = slots.filter((slot) => slot.loaded && pick[slot.section.id])
    if (!due.length) return Promise.resolve(false)
    const g = gen
    return Promise.all(due.map((slot) => loadHomeSection(slot.section, ctx).then((got) => ({ slot, got })))).then((answers) => {
      if (g !== gen) return false
      let changed = false
      answers.forEach(({ slot, got }) => {
        if (!got.length && slot.rows.length) return
        // A row that reads back as it was keeps its object, so Back from Details doesn't build its
        // cards again (on webOS that held the keys a few hundred ms after every Back).
        const next = got.map((r) => {
          const fresh = { ...r, _section: slot.section.id }
          const old = slot.rows.find((o) => o.key === fresh.key)
          return old && sameRow(old, fresh) ? old : fresh
        })
        if (next.length === slot.rows.length && next.every((r, i) => r === slot.rows[i])) return
        changed = true
        slot.rows = next
        cache.settleSections([slot.section.id], slot.rows)
      })
      if (changed) {
        publish()
        remember()
      }
      return true
    })
  }
  const refreshRecentRows = () => {
    if (Date.now() - lastRecent < cache.VOLATILE_REFRESH_COOLDOWN_MS) return
    lastRecent = Date.now()
    reloadSections(RECENT).then((done) => {
      if (!done) return
      cache.memoryCache.recentAt = Date.now()
      remember()
      redrawMediaBar()
    })
  }
  const refreshVolatileData = (force = false) => {
    if (Date.now() - loadFetchedVolatile < LOAD_FRESH_MS) return
    if (cache.memoryCache.recentAt && !cache.isCacheValid(cache.memoryCache.recentAt, cache.CACHE_TTL_LIBRARIES)) refreshRecentRows()
    if (!force && Date.now() - lastVolatile < cache.VOLATILE_REFRESH_COOLDOWN_MS) return
    lastVolatile = Date.now()
    reloadSections(VOLATILE)
  }

  // The sections held back load once focus comes within a few rows of where they sit.
  const loadNear = (cur = 0) => {
    const due = []
    let at = 0
    slots.forEach((slot) => {
      const n = slot.loaded ? slot.rows.length : cache.isEmptySection(slot.section.id) ? 0 : 1
      if (!slot.started && at + Math.max(n, 1) > cur - NEAR_ROWS_ABOVE && at <= cur + NEAR_ROWS_BELOW) due.push(slot)
      at += n
    })
    if (due.length) loadSlots(due, gen)
  }
  // A row near its last cards reads a longer head and adds what's new to its end (utils/rowPaging.js).
  const onRowLoadMore = (key) => {
    const slot = slots.find((sl) => sl.rows.some((r) => r.key === key))
    const r = slot && slot.rows.find((x) => x.key === key)
    if (!r || !r.hasMore || typeof r.readHead !== 'function' || paging[key]) return
    const mine = paging
    mine[key] = true
    pageRow(r)
      .then((next) => {
        delete mine[key]
        const at = slot.rows.indexOf(r)
        if (at < 0) return
        slot.rows = slot.rows.slice()
        slot.rows[at] = { ...next, _section: slot.section.id }
        publish()
        // The warm cache holds the row too, so coming back to Home keeps the cards paged in.
        cache.memoryCache.rowData = loadedRows()
      })
      .catch((e) => {
        // The row keeps its hasMore, so the next focus near the end tries again.
        delete mine[key]
        console.warn('[home] more of', key, 'failed', e)
      })
  }

  // Watch Parties, polled while Home shows. A party that started while Home was up shows for eight
  // seconds, a newer one taking its place.
  let alertTimer = null
  const party = createPartyRooms({
    onRooms: setPartyRooms,
    onAlert: (room) => {
      setPartyAlert(alertOf(room))
      clearTimeout(alertTimer)
      alertTimer = setTimeout(() => setPartyAlert(null), ALERT_MS)
    },
  })

  // The card previews follow the setting and the device gate, and stop whenever the rows leave the
  // screen (the bar, another page, the screensaver, the app going to the background).
  const platform = getPlatform()
  let webosVersion = null
  let previewFocus = ''
  const preview = createCardPreview({
    getSettings: () => settings.all(),
    api,
    platform,
    onPhase: (key, phase, rect) => {
      const playing = phase === 'playing'
      const r = playing && rect && rect()
      batch(() => {
        setPreviewKey(playing ? key : '')
        // On whole pixels, or the bands around it leave a seam where the video shows.
        setCardHole(r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), r: r.r } : null)
      })
    },
    onActive: (on) => holdScreensaver('preview', on),
  })
  const syncPreview = () => {
    const st = settings.all()
    const allowed = mediaPreviewAllowedOnDevice({ platform, legacyTizen: isLegacyTizen(), webosVersion, performanceMode: st.performanceMode })
    const visible = untrack(active) && !cache.appHidden()
    preview.setEnabled(mediaPreviewMode(st) !== 'off' && allowed && visible && untrack(mode) === 'rows' && !shell.saver)
    preview.setAudioEnabled(st.previewAudioEnabled !== false)
  }
  if (platform === 'webos') {
    getDeviceCapabilities()
      .then((caps) => {
        webosVersion = caps && typeof caps.webosVersion === 'number' ? caps.webosVersion : null
        syncPreview()
      })
      .catch(() => {})
  }
  const onCardPreview = (rowKey, card, rect) => {
    if (card) {
      previewFocus = `${rowKey}|${card.key}`
      preview.schedule(previewFocus, card.raw, rect)
    } else if (previewFocus && previewFocus.indexOf(rowKey + '|') === 0) {
      preview.cancel(previewFocus)
    }
  }

  const syncTrailer = () => {
    if (bar && bar.trailer) bar.trailer.sync()
  }

  // Leaving Home stops the bar's trailer and the previews as the route changes, and coming back
  // catches the rows up.
  let catchUp = null
  createEffect(
    on(active, (now, was) => {
      syncTrailer()
      syncPreview()
      party.setActive(now)
      if (!now || was === undefined) return
      store.navSection = 'home'
      if (stale) applySettings(true)
      // The catch-up reads go out once Home has drawn again.
      if (catchUp) catchUp()
      catchUp = afterDraw(getRenderer(), () => {
        catchUp = null
        if (!untrack(active)) return
        if (barEnabled()) fetchFreshFeatured()
        refreshVolatileData(true)
      })
    }),
  )
  createEffect(
    on(
      () => shell.saver,
      () => {
        syncTrailer()
        syncPreview()
      },
      { defer: true },
    ),
  )
  createEffect(on(mode, syncPreview, { defer: true }))
  // The server profile lands a moment after sign-in, and Settings changes rows while Home waits behind it.
  let settingsTimer = null
  createEffect(
    on(
      s,
      () => {
        party.setActive(untrack(active))
        clearTimeout(settingsTimer)
        settingsTimer = setTimeout(() => applySettings(false), SETTINGS_DEBOUNCE_MS)
        syncPreview()
      },
      { defer: true },
    ),
  )
  // Opening the app again resumes it where it was left, often on Home, so coming back to the app
  // catches the rows up the same way.
  const offVisible = cache.watchAppVisible((hidden) => {
    if (hidden) preview.stop('hidden')
    else refreshVolatileData()
    syncPreview()
  })
  const offRefresh = cache.onBrowseRefresh((detail) => {
    if (detail.newMediaBar) {
      refreshVolatileData(true)
      redrawMediaBar()
      return
    }
    cache.clearMemoryCache({ keepFeatured: !detail.featured })
    if (detail.libraries) cache.clearBrowseCache().then(load)
  })
  onCleanup(() => {
    gen++
    clearTimeout(alertTimer)
    clearTimeout(settingsTimer)
    clearTimeout(backTimer)
    if (catchUp) catchUp()
    party.destroy()
    preview.stop('unmount')
    offVisible()
    offRefresh()
    cache.cancelPendingCacheSave()
  })

  onMount(() => {
    store.navSection = 'home'
    syncPreview()
    load()
  })

  const onRowFocus = (card, rowKey, index, rowIndex) => {
    setMode('rows')
    loadNear(rowIndex)
    // Classic rows hand the title to the info area, or straight to the backdrop without one.
    // Modern and Carousel rows leave the backdrop be.
    if (look().overlay && detail) detail.focusItem(card.raw)
    else if (look().style === 'classic') {
      clearTimeout(backTimer)
      backTimer = setTimeout(() => setBackItem(card.raw), BACKDROP_SETTLE_MS)
    }
  }
  // A collection opens its details, a library its grid, a calendar its month.
  const onRowSeeAll = (row) => {
    if (row.collection) {
      const [path, data] = routeForItem(row.collection)
      router.to(path, data)
    } else if (row.isLatestRow && row.library) {
      store.navSection = row.library.Id
      router.to(routeForLibrary(row.library))
    } else if (row.seeAllCalendar) {
      router.to('/calendar/month')
    }
  }
  // Seerr rows and the outside lists, for the titles the library doesn't hold. A list title known
  // only by its IMDb id is found through a Seerr search.
  const openSeerr = async (it) => {
    const raw = it._seerrRaw || {}
    const type = it._seerrType
    if (type === 'shortcut') return openSeerrShortcut(router, raw.shortcut)
    if (type === 'genre') return router.to(`/seerr/browse/genre/${raw.mediaType}/${raw.genreId}`, { name: raw.genreName })
    if (type === 'studio') return router.to(`/seerr/browse/studio/movie/${raw.studioId}`, { name: raw.studioName })
    if (type === 'network') return router.to(`/seerr/browse/network/tv/${raw.networkId}`, { name: raw.networkName })
    if (it._seerrLibraryId) return router.to(`/details/${it._seerrLibraryId}`)
    const mediaType = raw.mediaType || it._seerrMediaType
    if (raw.mediaId) return router.to(`/seerr/item/${mediaType}/${raw.mediaId}`)
    let found = raw.imdbId ? await seerrApi.search(raw.imdbId).catch(() => null) : null
    if (!(found && found.results && found.results.length) && raw.title) found = await seerrApi.search(raw.title).catch(() => null)
    const match = bestSearchMatch((found && found.results) || [], mediaType)
    // shortcut: a title Seerr can't find shows a toast rather than a page of its own.
    if (!match) return toast($L('Not Available'))
    router.to(`/seerr/item/${match.mediaType === 'tv' || match.mediaType === 'movie' ? match.mediaType : mediaType}/${match.id}`)
  }
  const onRowSelect = (card, rowKey) => {
    preview.stop('select')
    const it = card.raw || {}
    if (it.isRecordingsShortcut) router.to('/recordings')
    else if (it.isLibraryTile) {
      store.navSection = it.Id
      router.to(routeForLibrary(it))
    } else if (isExternalItem(it)) openSeerr(it)
    else if (rowKey === 'studios') {
      if (it.Name) router.to('/library/all', { studioName: it.Name })
    } else if (it.Type === 'Genre') router.to(`/genrebrowse/${it.Id}`, { genreName: it.Name })
    else if (isLiveTvProgram(it)) router.to(`/player/${it.ChannelId}`, { live: true })
    else {
      // Continue Watching and Next Up play straight from their cards when Default Action is Play.
      const [path, data] = menuOptions(rowKey).playImmediately ? playRoute(it) : routeForItem(it)
      router.to(path, data)
    }
  }
  const onBarInfo = (it) => {
    if (isExternalItem(it)) return openSeerr(it)
    const [path, data] = routeForItem(it)
    router.to(path, data)
  }
  // The title's page opens and starts it, as a card menu's Play does.
  const onBarPlay = (it) => {
    if (isExternalItem(it)) return openSeerr(it)
    const [path, data] = playRoute(it)
    router.to(path, data)
  }
  // The Aya frame floats in the page, so its ambient backdrop stays up while the bar is.
  const onBarSlide = (slide) => {
    if (barStyle() === 'aya') setBackItem(slide && (slide.raw || slide))
  }
  const onBarTrailer = (on, frame) => {
    batch(() => {
      setTrailerOn(!!on)
      setHole(on && frame && frame.w > 0 ? { x: frame.x, y: frame.y, w: frame.w, h: frame.h } : null)
    })
  }

  return (
    <view
      ref={root}
      width={1920}
      height={1080}
      forwardFocus={() => {
        focusZone()
        return true
      }}
      // The bar or the rows, whichever the Magic Remote's cursor focuses (app/pointer.js).
      onPointerFocus={(n) => {
        for (let p = n; p; p = p.parent) {
          if (bar && p === bar) {
            if (mode() !== 'bar') setMode('bar')
            focusZone()
            return true
          }
          if (list && p === list) {
            if (mode() !== 'rows') setMode('rows')
            return false
          }
        }
        return false
      }}
      // Up from the first row goes back to the bar, or to a top navbar when there's no bar.
      onUp={() => {
        if (mode() === 'rows' && featured().length && barEnabled()) {
          setMode('bar')
          // Picking from the bar comes back to the bar, and the info area lets go of the title.
          if (detail) detail.clear()
          focusZone()
        } else if (!look().left) focusNav()
        return true
      }}
      onDown={() => {
        if (mode() !== 'bar' || !rows().some((r) => !r.isPlaceholder)) return true
        touched = true
        setMode('rows')
        if (list) list.focusRow(0)
        return true
      }}
      // Left from a row's first card reaches the sidebar.
      onLeft={() => {
        if (look().left) focusNav()
        return true
      }}
      // Back below the top row returns the list to it rather than leaving, so the exit prompt only
      // shows from the top of the screen. Anything else goes on to App, which asks to exit.
      onBack={() => {
        if (mode() === 'rows' && list && list.cur() > 0) {
          list.focusRow(0)
          return true
        }
        return false
      }}
    >
      <view width={1920} height={1080} alpha={bgClear() ? 0 : 1} transition={{ alpha: { duration: 250 } }}>
        <For each={bgBands()}>
          {(b) => (
            <view x={b.x} y={b.y} width={b.w} height={b.h} clipping>
              <view x={-b.x} y={-b.y} width={1920} height={1080}>
                <BackdropLayer
                  url={backdrop()}
                  placement={placement()}
                  blur={s().backdropBlurHome}
                  bg={bg()}
                  scrim={look().scrim}
                  instant={b.k !== 'all'}
                  flat={look().holeCorner}
                />
              </view>
            </view>
          )}
        </For>
        <view>
          <For each={holeCorners()}>{(c) => <view x={c.x} y={c.y} width={c.r} height={c.r} color={look().holeCorner} shader={c.shader} />}</For>
        </view>
      </view>

      <view>
        <Show when={barComponent(barEnabled() ? barStyle() : 'off')} keyed>
          {(Bar) => (
            <Dynamic
              component={Bar}
              ref={(n) => (bar = n)}
              items={featured()}
              rowPeek={rowPeek()}
              // Just above 0 while Home loads, so the bar's art loads behind the skeleton and none of
              // its buttons show over it.
              alpha={mode() === 'bar' ? (loading() ? 0.001 : 1) : 0}
              onBarSlide={onBarSlide}
              onBarInfo={onBarInfo}
              onBarPlay={onBarPlay}
              onBarTrailer={onBarTrailer}
            />
          )}
        </Show>
      </view>

      <view>
        <Show when={look().overlay && !loading()}>
          <DetailSection ref={(n) => (detail = n)} visible={mode() === 'rows'} left={look().left} onFocusedItemChange={setBackItem} />
        </Show>
      </view>
      <view>
        <Show when={showRows()}>
          <HomeRows
            ref={(n) => (list = n)}
            rows={shaped()}
            look={look()}
            band={band()}
            firstMargin={firstMargin()}
            preview={previewKey()}
            alpha={rowsAlpha()}
            onRowFocus={onRowFocus}
            onRowSelect={onRowSelect}
            onRowSeeAll={onRowSeeAll}
            onRowLoadMore={onRowLoadMore}
            onCardPreview={onCardPreview}
            onRowsNear={(cur) => {
              touched = true
              loadNear(cur)
            }}
          />
        </Show>
      </view>
      <view>
        <Show when={skeleton()}>
          <HomeSkeleton layout={skeleton()} ink={look().skeleton} still={look().tier === 'low'} inset={look().inset} panelW={look().viewW - look().pad * 2} />
        </Show>
      </view>
      <view>
        <Show when={empty()}>
          <text
            x={look().clipX + look().viewW / 2}
            y={(look().left ? 42 : 130) + 150}
            mountX={0.5}
            mountY={0.5}
            fontFamily={uiFont()}
            fontSize={32}
            color={look().overview}
          >
            {$L('No content found')}
          </text>
        </Show>
      </view>
      <view>
        <Show when={partyAlert()} keyed>
          {(pa) => <WatchPartyAlert head={pa.head} line={pa.line} host={pa.host} poster={pa.poster} />}
        </Show>
      </view>
    </view>
  )
}
