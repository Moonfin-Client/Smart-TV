import $L from '../../../services/i18n.js'
import { For, Show, batch, createMemo, createSelector, createSignal, onMount } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { Kept, keyed } from '../library/pageKit.js'
import { slideMs } from '../library/motion.js'
import { menuHold } from '../modals/menuHold.js'
import { focusScroll } from '../nav/focusScroll.js'
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import { getFromStorage, saveToStorage } from '../../../services/storage.js'
import {
  SCOPE_ALL,
  availableScopes,
  bookImageUrl,
  bookProgressMeta,
  bookSubtitle,
  isAudiobookItem,
  isAudiobookLibrary,
  isMixedLibrary,
  matchesScope,
  playedPercent,
  scopeLabel,
} from '../../../utils/bookLibrary.js'
import { cleanOverview } from '../../../utils/overviewText.js'
import BookCard from './BookCard.jsx'
import { HeroButtons, Pill, TabBar } from './BookControls.jsx'
import SidePanel from './SidePanel.jsx'
import { bookCard } from './bookCards.js'
import { columnsFor, gridMove, gridRows, lineY, rowIndexOf } from './bookGrid.js'
import { bookPointer, heroButtons, pillWidth, showsWhole } from './bookParts.js'
import { lineCount, tabBarWidth, textWidth } from './bookText.js'
import { bookMenuItem, bookNavFor, formatEyebrow, titleMeta, titlesCount, titlesHeading } from './bookScreens.js'
import { TITLE_SORTS, sortById, titlesFetcher } from './bookTitles.js'
import { tx } from '../../fx.js'

const PAGE_SIZE = 100
const TARGET = 230
const INSETS = 120
const GAP = 30
const ROW_GAP = 24
const PANEL_COVER = 210
// Rows drawn beyond the screen's edges, so a move never lands on a card still being built.
const MARGIN = 700
const CLEAR = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }
const NO_PANEL = { none: true, w: 0, h: 0, coverH: 0, image: '', infoW: 0, buttons: [], percent: 0, progress: '', buttonsY: 0 }
const SORTS = () => TITLE_SORTS.map((sort) => ({ id: sort.id, label: sort.label() }))

// Picking a title opens a panel under its row. A See All that names a sort or a format opens on it.
// The host gets onScreenLeft(), onScreenUp(), openDetails(item) and readItem(item), and the node
// has land().
export default function TitlesScreen(props) {
  const [items, setItems] = createSignal([])
  const [cards, setCards] = createSignal([])
  const [total, setTotal] = createSignal(0)
  const [loaded, setLoaded] = createSignal(false)
  const [complete, setComplete] = createSignal(false)
  const [sortId, setSortId] = createSignal(props.sort || 'dateAdded')
  const [genre, setGenre] = createSignal(null)
  const [scopeChoice, setScopeChoice] = createSignal(props.scope || SCOPE_ALL)
  const [zone, setZone] = createSignal('grid')
  const [cur, setCur] = createSignal(0)
  const [ccur, setCcur] = createSignal(0)
  const [hcur, setHcur] = createSignal(-1)
  const [pcur, setPcur] = createSignal(0)
  const [openIndex, setOpenIndex] = createSignal(-1)
  const [full, setFull] = createSignal(null)
  const [favs, setFavs] = createSignal({})
  const [scrollY, setScrollY] = createSignal(0)
  const [glideMs, setGlideMs] = createSignal(0)
  const [contX, setContX] = createSignal(0)
  const [showGenres, setShowGenres] = createSignal(false)
  const [has, setHas] = createSignal(false)
  const my = { gen: 0, fetch: null, next: 0, busy: false, landPending: false }
  let root
  let genresRef = null
  const look = () => props.look
  const textFont = uiFont()
  // The screen draws as focused only while focus is its own, not the genre panel's.
  const own = () => has() && !showGenres()

  const bookstore = () => bookNavFor(props.bookStyle) === 'rail'
  const shownScope = () => (bookstore() ? props.scope || SCOPE_ALL : scopeChoice())
  const mixed = createMemo(() => isMixedLibrary(props.library, props.data.counts))
  const cw = () => 1920 - (props.railW || 0)
  const cols = createMemo(() => columnsFor(TARGET, INSETS, GAP, props.railW || 0))
  const resume = createMemo(() => {
    if (!bookstore()) return []
    const scope = shownScope()
    return (props.data.resume || [])
      .filter((item) => matchesScope(item, scope))
      .map((item, i) => {
        const audio = isAudiobookItem(item)
        const subtitle = bookSubtitle(item)
        const meta = bookProgressMeta(item) || ''
        const coverW = audio ? 120 : 94
        const coverH = audio ? 120 : 140
        const textH = 33 + (subtitle ? 36 : 0) + 22 + (meta ? 41 : 0)
        const textX = 13 + coverW + 20
        return {
          k: item.Id,
          i,
          raw: item,
          x: i * 588,
          image: bookImageUrl(item._serverUrl || getServerUrl(), item) || '',
          icon: audio ? 'book_headphones_rounded' : 'book_menu_book_rounded',
          coverW,
          coverH,
          coverY: (167 - coverH) / 2,
          textX,
          textW: 568 - textX - 17 - 73 - 20,
          title: item.Name || '',
          titleFont: fontFor(item.Name || '', 'bold'),
          subtitle,
          subtitleFont: fontFor(subtitle),
          meta,
          textTop: (167 - textH) / 2,
          subtitleY: 36,
          barY: 33 + (subtitle ? 36 : 0) + 17,
          metaY: 33 + (subtitle ? 36 : 0) + 30,
          fill: Math.min(playedPercent(item), 100) / 100,
        }
      })
  })
  const resumeList = keyed(resume, (r) => r.k)
  const resumeH = () => (resume().length ? 248 : 0)
  const sortTabs = SORTS()
  const scopeTabs = createMemo(() => availableScopes(props.data.counts).map((id) => ({ id, label: scopeLabel(id) })))
  const showScopeTabs = () => !bookstore() && mixed()
  const filterLabel = () => (genre() ? genre().Name : $L('Filter'))
  // The header's controls left to right, right-aligned at the inset.
  const controls = createMemo(() => {
    const out = []
    const scopeW = showScopeTabs() ? tabBarWidth(scopeTabs(), shownScope()) : 0
    const sortW = tabBarWidth(sortTabs, sortId())
    const filterW = pillWidth(filterLabel(), true)
    const x = cw() - 60 - filterW - 15 - sortW - (showScopeTabs() ? 15 + scopeW : 0)
    if (showScopeTabs()) scopeTabs().forEach((tab, i) => out.push({ kind: 'scope', i, id: tab.id }))
    sortTabs.forEach((tab, i) => out.push({ kind: 'sort', i, id: tab.id }))
    out.push({ kind: 'filter', i: 0 })
    return { list: out, scopeX: x, sortX: x + (showScopeTabs() ? scopeW + 15 : 0), filterX: cw() - 60 - filterW }
  })
  const focusedControl = () => (zone() === 'header' && own() ? controls().list[hcur()] : null)
  const controlFocus = (kind) => {
    const c = focusedControl()
    return c && c.kind === kind ? c.i : -1
  }
  const heading = () => titlesHeading(shownScope())
  // The heading shrinks to leave the controls beside it 24px and its count.
  const headingW = () => {
    const count = countText()
    const room = controls().scopeX - 24 - 60 - (count ? 20 + textWidth(count, 22) : 0)
    return Math.max(0, Math.min(textWidth(heading(), 48, 'bold'), room))
  }
  const countText = () => {
    if (genre()) return complete() ? titlesCount(items().length) || '' : ''
    return titlesCount(props.data.counts[shownScope()]) || ''
  }
  const rows = createMemo(() => gridRows(cards().length, cols().columns))
  const openRow = () => (openIndex() >= 0 ? rowIndexOf(rows(), openIndex()) : -1)
  const opened = () => (openIndex() >= 0 ? items()[openIndex()] : null)
  const panel = createMemo(() => {
    const item = opened()
    if (!item) return NO_PANEL
    const f = full()
    const shown = f && f.Id === item.Id ? f : item
    const audio = isAudiobookItem(item)
    const w = cw() - 120
    const infoW = w - 72 - PANEL_COVER - 42
    const g = shown.Genres && shown.Genres[0]
    const eyebrow = (g ? formatEyebrow(item) + ' · ' + g : formatEyebrow(item)).toUpperCase()
    const title = item.Name || ''
    const titleLines = Math.max(1, lineCount(title, 40, 'bold', infoW, 2))
    const meta = titleMeta(shown)
    const overview = shown.Overview ? cleanOverview(shown.Overview) : ''
    const overviewLines = overview ? lineCount(overview, 21, 'regular', infoW, 3) : 0
    const progress = bookProgressMeta(item) || ''
    const percent = playedPercent(item)
    // The eyebrow can wrap under a wide theme face.
    const eyebrowLines = Math.max(1, lineCount(eyebrow, 18, 'bold', infoW, 99, 1))
    let y = 33 * eyebrowLines + 8
    const titleY = y
    y += 44 * titleLines + 6
    const metaY = y
    if (meta) y += 33
    const overviewY = y + 14
    if (overview) y += 14 + 29.4 * overviewLines
    const progressY = y + 18
    if (progress) y += 18 + 33
    const buttonsY = y + 28
    y += 28 + 52
    const coverH = audio ? PANEL_COVER : PANEL_COVER * 1.5
    const fav = favs()[item.Id] != null ? favs()[item.Id] : !!(item.UserData && item.UserData.IsFavorite)
    return {
      none: false,
      w,
      h: 60 + Math.max(coverH, y),
      coverH,
      image: bookImageUrl(item._serverUrl || getServerUrl(), item) || '',
      infoW,
      eyebrow,
      title,
      titleFont: fontFor(title, 'bold'),
      titleY,
      meta,
      metaFont: fontFor(meta),
      metaY,
      overview,
      overviewFont: fontFor(overview),
      overviewY,
      progress,
      progressY,
      percent: percent > 0 ? Math.min(percent, 100) / 100 : 0,
      buttonsY,
      buttons: heroButtons([
        { id: 'read', label: audio ? $L('Listen') : $L('Read'), icon: audio ? 'book_headphones_rounded' : 'book_menu_book_rounded', primary: true },
        { id: 'details', label: $L('Details'), icon: 'core_info_outline' },
        { id: 'favorite', icon: fav ? 'book_favorite_rounded' : 'book_favorite_border_rounded', round: true, w: 55 },
      ]),
    }
  })
  // Every row's place, and the open panel's after its row, in the scroller's coordinates.
  const geo = createMemo(() => {
    const top = resumeH() + 105
    const list = cards()
    const out = []
    let y = top
    let panelY = -1
    const p = panel()
    const or = openRow()
    rows().forEach((row, r) => {
      let h = 0
      for (let i = row.start; i < row.end; i++) h = Math.max(h, list[i].h + 78)
      out.push({ y, h })
      y += h + ROW_GAP
      if (r === or && !p.none) {
        panelY = y
        y += p.h + 30
      }
    })
    return { rows: out, panelY, height: y + 60 }
  })
  // Only the rows near the screen are built.
  const placed = createMemo(() => {
    const lo = scrollY() - MARGIN
    const hi = scrollY() + props.viewH + MARGIN
    const list = cards()
    const g = geo()
    const c = cols()
    const out = []
    rows().forEach((row, r) => {
      const gr = g.rows[r]
      if (gr.y + gr.h < lo || gr.y > hi) return
      for (let i = row.start; i < row.end; i++) {
        const card = list[i]
        out.push({ card, k: card.key, i, x: 60 + (i - row.start) * (c.width + GAP), y: gr.y + gr.h - (card.h + 78) })
      }
    })
    return out
  })
  const placedList = keyed(placed, (p) => p.k)
  const isCur = createSelector(cur)
  const isCcur = createSelector(ccur)
  const caretX = () => {
    const row = rows()[openRow()]
    return row ? (openIndex() - row.start) * (cols().width + GAP) + cols().width / 2 - 14 : 0
  }
  const genreOptions = createMemo(() =>
    [{ id: null, label: $L('Any Genre'), on: !genre() }].concat(
      (props.data.genres || []).map((g) => ({ id: g.Id, label: g.Name, on: !!(genre() && genre().Id === g.Id), raw: g })),
    ),
  )
  const continueLabel = () => (isAudiobookLibrary(props.library) ? $L('Continue Listening') : $L('Continue Reading'))
  const sectionY = lineY(24, 33, 28)
  const headingY = () => resumeH() + lineY(18 + 63 - 55.2, 55.2, 48)
  // Baseline-aligned with the heading.
  const countY = () => headingY() - 1 + 0.927 * (48 - 22)

  const restart = () => {
    my.gen++
    batch(() => {
      setItems([])
      setCards([])
      setTotal(0)
      setLoaded(false)
      setComplete(false)
      setOpenIndex(-1)
      setCur(0)
      setScrollY(0)
    })
    my.fetch = titlesFetcher({ api, library: props.library, scope: shownScope(), sort: sortById(sortId()), genreId: genre() && genre().Id })
    my.next = 0
    loadPage(0)
  }
  const loadPage = async (start) => {
    const gen = my.gen
    my.busy = true
    try {
      const page = await my.fetch(start, PAGE_SIZE)
      if (gen !== my.gen) return
      const base = items().length
      const showFormat = mixed() && shownScope() === SCOPE_ALL
      const w = cols().width
      batch(() => {
        setItems(start > 0 ? items().concat(page.items) : page.items)
        setCards((start > 0 ? cards() : []).concat(page.items.map((it, i) => bookCard(it, (start > 0 ? base : 0) + i, w, { showFormat }))))
        setTotal(page.total)
      })
      my.next = start + PAGE_SIZE
    } catch (e) {
      if (gen !== my.gen) return
      my.next = total()
    }
    batch(() => {
      setLoaded(true)
      setComplete(my.next >= total())
    })
    my.busy = false
    if (start === 0 && my.landPending) land()
  }
  const loadMore = () => {
    if (my.busy || !loaded() || my.next >= total()) return
    loadPage(my.next)
  }
  onMount(async () => {
    const stored = await getFromStorage('book_sort_' + (props.library && props.library.Id)).catch(() => null)
    if (!props.sort) setSortId(sortById(stored || 'dateAdded').id)
    restart()
  })

  // The focused thing's box in the scroller.
  const focusBox = () => {
    if (zone() === 'continue') return { top: 69, h: 167 }
    if (zone() === 'header') return { top: resumeH() + 18, h: 63 }
    if (zone() === 'panel') return { top: geo().panelY + 30 + panel().buttonsY, h: 52 }
    const r = rowIndexOf(rows(), cur())
    const g = geo().rows[r]
    const card = cards()[cur()]
    if (!g || !card) return null
    return { top: g.y + g.h - (card.h + 78), h: card.h + 78 }
  }
  const scrollTo = (y, ms) => {
    batch(() => {
      setGlideMs(ms || 0)
      setScrollY(y)
    })
  }
  const reveal = () => {
    const box = focusBox()
    if (!box) return
    scrollTo(focusScroll(box.top, box.h, scrollY(), props.viewH, Math.max(0, geo().height - props.viewH)))
    if (zone() === 'continue') {
      const view = cw() - 108
      setContX(focusScroll(12 + ccur() * 588, 568, contX(), view, Math.max(0, 12 + resume().length * 588 - 20 + 33 - view)))
    }
    if (zone() === 'grid' && rowIndexOf(rows(), cur()) >= rows().length - 3) loadMore()
  }
  // Where Right from the rail lands: what's being read, the first title, the header.
  const land = () => {
    // Nothing's in yet, so the landing waits for the first page.
    if (!loaded() && !resume().length) {
      my.landPending = true
      setZone('grid')
      return
    }
    my.landPending = false
    batch(() => {
      if (resume().length) setZone('continue')
      else if (cards().length) setZone('grid')
      else setZone('header')
      if (zone() === 'grid') setCur(Math.min(cur(), cards().length - 1))
      if (zone() === 'header' && hcur() < 0) setHcur(0)
    })
    reveal()
  }
  const focusHeader = () => {
    batch(() => {
      setZone('header')
      if (hcur() < 0) setHcur(0)
    })
    reveal()
  }
  const toGrid = (i) => {
    batch(() => {
      setZone('grid')
      setCur(i)
    })
    reveal()
  }
  // The Magic Remote's cursor (app/pointer.js): a control, a continue tile or a cover in full view
  // takes focus on hover; one the page or the continue row would scroll to takes it on a click.
  const point = bookPointer(props, has)
  const shows = (top, h) => showsWhole(top, h, scrollY(), props.viewH)
  const pointGrid = (i, click) => {
    const g = geo().rows[rowIndexOf(rows(), i)]
    const card = cards()[i]
    if (!g || !card || showGenres()) return false
    return point(() => toGrid(i), { whole: shows(g.y + g.h - (card.h + 78), card.h + 78), lit: own() && zone() === 'grid' && cur() === i, click })
  }
  const pointControl = (kind, i, click) => {
    const at = controls().list.findIndex((c) => c.kind === kind && c.i === i)
    if (at < 0 || showGenres()) return false
    return point(
      () => {
        batch(() => {
          setZone('header')
          setHcur(at)
        })
        reveal()
      },
      { whole: shows(resumeH() + 18, 63), lit: own() && zone() === 'header' && hcur() === at, click },
    )
  }
  const pointContinue = (i, click) => {
    if (!resume()[i] || showGenres()) return false
    const x = 12 + i * 588 - contX()
    return point(
      () => {
        batch(() => {
          setZone('continue')
          setCcur(i)
        })
        reveal()
      },
      { whole: shows(69, 167) && x >= 0 && x + 568 <= cw() - 108, lit: own() && zone() === 'continue' && ccur() === i, click },
    )
  }
  const pointPanel = (i, click) => {
    if (showGenres()) return false
    return point(
      () => {
        batch(() => {
          setZone('panel')
          setPcur(i)
        })
        reveal()
      },
      { whole: shows(geo().panelY + 30 + panel().buttonsY, 52), lit: own() && zone() === 'panel' && pcur() === i, click },
    )
  }
  const gridKey = (direction) => {
    const r = rowIndexOf(rows(), cur())
    // The open panel sits between its row and the next, so both step into it at Read.
    if (openRow() >= 0 && ((direction === 'down' && r === openRow()) || (direction === 'up' && r === openRow() + 1))) {
      batch(() => {
        setZone('panel')
        setPcur(0)
      })
      return reveal()
    }
    const next = gridMove(rows(), r, cur(), direction)
    if (next != null) return toGrid(next)
    if (direction === 'up') focusHeader()
    else if (direction === 'left') props.host.onScreenLeft()
  }
  const headerKey = (direction) => {
    const list = controls().list
    if (direction === 'left') {
      if (hcur() > 0) setHcur(hcur() - 1)
      else props.host.onScreenLeft()
    } else if (direction === 'right') {
      if (hcur() < list.length - 1) setHcur(hcur() + 1)
    } else if (direction === 'up') {
      if (resume().length) {
        setZone('continue')
        reveal()
      } else props.host.onScreenUp()
    } else if (direction === 'down' && cards().length) toGrid(0)
  }
  const continueKey = (direction) => {
    if (direction === 'left') {
      if (ccur() > 0) {
        setCcur(ccur() - 1)
        reveal()
      } else props.host.onScreenLeft()
    } else if (direction === 'right') {
      if (ccur() < resume().length - 1) {
        setCcur(ccur() + 1)
        reveal()
      }
    } else if (direction === 'down') focusHeader()
  }
  const panelKey = (direction) => {
    const n = panel().buttons.length
    if (direction === 'left') {
      if (pcur() > 0) setPcur(pcur() - 1)
      else props.host.onScreenLeft()
    } else if (direction === 'right') {
      if (pcur() < n - 1) setPcur(pcur() + 1)
    } else if (direction === 'up') toGrid(openIndex())
    else if (direction === 'down') {
      const below = gridMove(rows(), openRow(), openIndex(), 'down')
      if (below != null) toGrid(below)
    }
  }
  const key = (direction) => () => {
    const z = zone()
    if (z === 'grid') gridKey(direction)
    else if (z === 'header') headerKey(direction)
    else if (z === 'continue') continueKey(direction)
    else if (z === 'panel') panelKey(direction)
    return true
  }
  const openPanel = async (index) => {
    if (openIndex() === index) {
      setOpenIndex(-1)
      return
    }
    batch(() => {
      setOpenIndex(index)
      setFull(null)
      setZone('panel')
      setPcur(0)
    })
    // The panel glides up near the top of the screen.
    scrollTo(Math.max(0, Math.min(geo().panelY - props.viewH * 0.05, Math.max(0, geo().height - props.viewH))), slideMs(220))
    const item = items()[index]
    try {
      const f = await api.getItem(item.Id)
      if (f && openIndex() === index) setFull(f)
    } catch (e) {
      // The panel keeps what the grid already had.
    }
  }
  const activateControl = () => {
    const c = controls().list[hcur()]
    if (!c) return
    if (c.kind === 'filter') {
      setShowGenres(true)
      if (genresRef) genresRef.setFocus()
    } else if (c.kind === 'sort' && c.id !== sortId()) {
      setSortId(c.id)
      saveToStorage('book_sort_' + (props.library && props.library.Id), c.id).catch(() => {})
      restart()
    } else if (c.kind === 'scope' && c.id !== scopeChoice()) {
      setScopeChoice(c.id)
      restart()
    }
  }
  const onPanelClose = () => {
    batch(() => {
      setShowGenres(false)
      setZone('header')
      setHcur(controls().list.length - 1)
    })
    root.setFocus()
  }
  const onPanelPick = (option) => {
    setGenre(option.id ? option.raw : null)
    onPanelClose()
    restart()
  }
  const toggleFavorite = async (item) => {
    const id = item.Id
    const now = favs()[id] != null ? favs()[id] : !!(item.UserData && item.UserData.IsFavorite)
    setFavs({ ...favs(), [id]: !now })
    try {
      await api.setFavorite(id, !now)
    } catch (e) {
      setFavs({ ...favs(), [id]: now })
    }
  }
  const enter = () => {
    const z = zone()
    if (z === 'grid') {
      if (cards()[cur()]) openPanel(cur())
    } else if (z === 'header') activateControl()
    else if (z === 'continue') {
      const tile = resume()[ccur()]
      if (tile) props.host.openDetails(tile.raw)
    } else if (z === 'panel') {
      const item = opened()
      const b = panel().buttons[pcur()]
      if (!item || !b) return
      if (b.id === 'read') props.host.readItem(item)
      else if (b.id === 'details') props.host.openDetails(item)
      else if (b.id === 'favorite') toggleFavorite(item)
    }
  }
  // A held OK on a cover or a continue tile opens the item menu.
  const heldItem = () => {
    if (zone() === 'grid') return bookMenuItem(items()[cur()])
    if (zone() === 'continue') return bookMenuItem((resume()[ccur()] || {}).raw)
    return null
  }
  const hold = menuHold(heldItem, enter)

  return (
    <view
      ref={(n) => {
        root = n
        n.land = land
        n.landControls = () => {
          // The header's first tab bar enters on its picked tab.
          const list = controls().list
          const first = list[0] && list[0].kind
          const picked = list.findIndex((c) => c.kind === first && c.id === (first === 'scope' ? shownScope() : sortId()))
          batch(() => {
            setZone('header')
            setHcur(Math.max(0, picked))
          })
          reveal()
          return true
        }
        if (props.ref) props.ref(n)
      }}
      width={cw()}
      height={props.viewH}
      onFocusChanged={setHas}
      onCaptureEnter={hold.down}
      onCaptureEnterRelease={hold.up}
      onMenu={hold.menu}
      onUp={key('up')}
      onDown={key('down')}
      onLeft={key('left')}
      onRight={key('right')}
      onEnter={() => {
        enter()
        return true
      }}
      onBack={() => {
        // Back closes the panel first.
        if (openIndex() < 0) return false
        const i = openIndex()
        setOpenIndex(-1)
        toGrid(i)
        return true
      }}
    >
      <view width={cw()} height={props.viewH} clipping>
      <view transition={tx({ y: { duration: glideMs(), easing: 'cubic-bezier(0.33, 1, 0.68, 1)' } })} y={-scrollY()} width={cw()} height={Math.max(props.viewH, geo().height)}>
        <view width={cw()} height={248} alpha={resume().length ? 1 : 0}>
          <text fontFamily={uiFont('bold')} fontSize={28} x={60} y={sectionY} color={look().onSurface}>
            {continueLabel()}
          </text>
          <view x={48} y={57} width={cw() - 108} height={191} clipping>
            <view x={12 - contX()} y={12} width={Math.max(cw(), resume().length * 588 + 45)} height={167}>
              <For each={resumeList.keys()}>
                {(k) => {
                  const tile = resumeList.item(k)
                  const lit = () => zone() === 'continue' && own() && isCcur(tile().i)
                  return (
                    <view
                      x={tile().x}
                      width={568}
                      height={167}
                      pivot={0.5}
                      transition={{ scale: { duration: 150, easing: 'ease-out' } }}
                      scale={lit() ? 1.03 : 1}
                      onPointerOver={() => pointContinue(tile().i, false)}
                      onPointerClick={() => pointContinue(tile().i, true)}
                    >
                      <view width={568} height={167} borderRadius={23} color={look().os06} />
                      <view x={-3} y={-3} width={574} height={173} borderRadius={26} color={CLEAR} border={{ width: 3, color: hex(look().focus) }} alpha={lit() ? 1 : 0} />
                      <view x={13} y={tile().coverY} width={tile().coverW} height={tile().coverH} borderRadius={8} color={look().surfaceVariant}>
                        <Show
                          when={tile().image}
                          fallback={
                            <view
                              x={(tile().coverW - 40) / 2}
                              y={(tile().coverH - 40) / 2}
                              width={40}
                              height={40}
                              src={'icons/' + tile().icon + '.webp'}
                              color={look().os40}
                            />
                          }
                        >
                          <view width={tile().coverW} height={tile().coverH} borderRadius={8} src={tile().image} textureOptions={COVER} />
                        </Show>
                      </view>
                      <view x={tile().textX} y={tile().textTop}>
                        <text fontFamily={tile().titleFont} fontSize={20} y={7} maxWidth={tile().textW} maxLines={1} color={look().onSurface}>
                          {tile().title}
                        </text>
                        <text fontFamily={tile().subtitleFont} fontSize={16} y={tile().subtitleY + 7} maxWidth={tile().textW} maxLines={1} color={look().os62}>
                          {tile().subtitle}
                        </text>
                        <view y={tile().barY} width={tile().textW} height={5} borderRadius={2.5} color={look().os14}>
                          <view width={tile().textW * tile().fill} height={5} color={look().accent} />
                        </view>
                        <text fontFamily={textFont} fontSize={18} y={tile().metaY + 6} color={look().os68}>
                          {tile().meta}
                        </text>
                      </view>
                      <view x={475} y={47} width={73} height={73} borderRadius={36.5} color={look().accent}>
                        <view x={16.5} y={16.5} width={40} height={40} src="icons/book_play_arrow_rounded.webp" color={look().onAccent} />
                      </view>
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
        </view>

        {/* With no room left for an ellipsis, the heading shows its clipped start instead. */}
        <view x={60} width={Math.max(1, headingW())} height={resumeH() + 100} clipping>
          <text
            fontFamily={fontFor(heading(), 'bold')}
            fontSize={48}
            y={headingY()}
            maxWidth={headingW() >= textWidth('\u2026', 48, 'bold') * 2 ? headingW() : 0}
            maxLines={1}
            color={look().onSurface}
          >
            {heading()}
          </text>
        </view>
        <text fontFamily={uiFont()} fontSize={22} x={60 + headingW() + 20} y={countY()} color={look().os65}>
          {countText()}
        </text>
        <view>
          <Show when={showScopeTabs()}>
            <TabBar
              x={controls().scopeX}
              y={resumeH() + 18}
              tabs={scopeTabs()}
              active={shownScope()}
              focus={controlFocus('scope')}
              look={look()}
              onPointerTab={(i) => pointControl('scope', i, false)}
              onPointerTabClick={(i) => pointControl('scope', i, true)}
            />
          </Show>
        </view>
        <TabBar
          x={controls().sortX}
          y={resumeH() + 18}
          tabs={sortTabs}
          active={sortId()}
          focus={controlFocus('sort')}
          look={look()}
          onPointerTab={(i) => pointControl('sort', i, false)}
          onPointerTabClick={(i) => pointControl('sort', i, true)}
        />
        <Pill
          x={controls().filterX}
          y={resumeH() + 22}
          label={filterLabel()}
          icon="core_filter_list"
          focused={controlFocus('filter') === 0}
          iconColor={genre() ? look().accent : ''}
          look={look()}
          onPointerOver={() => pointControl('filter', 0, false)}
          onPointerClick={() => pointControl('filter', 0, true)}
        />

        <view width={cw()} height={Math.max(props.viewH, geo().height)}>
          <For each={placedList.keys()}>
            {(k) => {
              const pc = placedList.item(k)
              return (
                <BookCard
                  x={pc().x}
                  y={pc().y}
                  card={pc().card}
                  look={look()}
                  zoom={props.zoom}
                  focused={zone() === 'grid' && own() && isCur(pc().i)}
                  onPointerOver={() => pointGrid(pc().i, false)}
                  onPointerClick={() => pointGrid(pc().i, true)}
                />
              )
            }}
          </For>
        </view>

        <view>
          <Show when={!panel().none}>
            <view x={60} y={geo().panelY} width={panel().w} height={panel().h}>
              <view x={caretX()} y={-14} width={28} height={14} clipping>
                <view x={4.1} y={4.1} width={19.8} height={19.8} rotation={Math.PI / 4} color={look().os06} />
              </view>
              <view width={panel().w} height={panel().h} borderRadius={24} color={look().os06} />
              <view>
                <Show when={panel().image}>
                  <view x={36} y={30} width={210} height={panel().coverH} borderRadius={12} src={panel().image} textureOptions={COVER} />
                </Show>
              </view>
              <view x={288} y={30}>
                <text fontFamily={uiFont('bold')} fontSize={18} letterSpacing={1} lineHeight={33} y={lineY(0, 33, 18)} maxWidth={panel().infoW} color={look().accent}>
                  {panel().eyebrow}
                </text>
                <text fontFamily={panel().titleFont} fontSize={40} y={panel().titleY + 2} lineHeight={44} maxWidth={panel().infoW} maxLines={2} color={look().onSurface}>
                  {panel().title}
                </text>
                <text fontFamily={panel().metaFont} fontSize={21} y={panel().metaY + 4} maxWidth={panel().infoW} maxLines={1} color={look().os75}>
                  {panel().meta}
                </text>
                <text
                  fontFamily={panel().overviewFont}
                  fontSize={21}
                  y={panel().overviewY + 2}
                  lineHeight={29.4}
                  maxWidth={panel().infoW}
                  maxLines={3}
                  color={look().os75}
                >
                  {panel().overview}
                </text>
                <view y={panel().progressY} alpha={panel().progress ? 1 : 0}>
                  <view alpha={panel().percent > 0 ? 1 : 0} y={12.5} width={300} height={8} borderRadius={4} color={look().os18}>
                    <view width={300 * panel().percent} height={8} borderRadius={4} color={look().accent} />
                  </view>
                  <text fontFamily={textFont} fontSize={19} x={panel().percent > 0 ? 318 : 0} y={5} color={look().os65}>
                    {panel().progress}
                  </text>
                </view>
                <HeroButtons
                  y={panel().buttonsY}
                  buttons={panel().buttons}
                  focus={zone() === 'panel' && own() ? pcur() : -1}
                  look={look()}
                  onPointerButton={(i) => pointPanel(i, false)}
                  onPointerButtonClick={(i) => pointPanel(i, true)}
                />
              </view>
            </view>
          </Show>
        </view>

        <view>
          <Show when={!loaded() && total() === 0}>
            <text fontFamily={textFont} fontSize={20} x={12} y={resumeH() + 81 + 16} color={look().os50}>
              {$L('Loading...')}
            </text>
          </Show>
          <Show when={complete() && items().length === 0}>
            <text fontFamily={textFont} fontSize={20} x={cw() / 2} y={resumeH() + 81 + 48 + 5} mountX={0.5} color={look().os50}>
              {$L('No items found')}
            </text>
          </Show>
        </view>
      </view>
      </view>

      {/* The genre panel covers the whole screen, the rail and the strip included. */}
      <view x={-(props.railW || 0)} y={-(props.top || 0)} width={1920} height={1080}>
        <Show when={showGenres()}>
          <Kept gone={() => (genresRef = null)}>
            <SidePanel
              ref={(n) => (genresRef = n)}
              title={$L('Filter by Genre')}
              options={genreOptions()}
              kind="radio"
              start={Math.max(0, genreOptions().findIndex((o) => o.on))}
              look={look()}
              onPanelPick={onPanelPick}
              onPanelClose={onPanelClose}
            />
          </Kept>
        </Show>
      </view>
    </view>
  )
}
