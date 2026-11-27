import $L from '../../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSelector, createSignal, on, onCleanup, onMount } from 'solid-js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { fontFor, uiFont } from '../../text.js'
import Keyboard from '../Keyboard.jsx'
import { openNativeInput, usesNativeKeyboard } from '../account/nativeInput.js'
import { Kept, keyed } from '../library/pageKit.js'
import { focusScroll } from '../nav/focusScroll.js'
import { getFromStorage, saveToStorage } from '../../../services/storage.js'
import { isAudiobookLibrary } from '../../../utils/bookLibrary.js'
import { formatDuration } from '../../../utils/helpers.js'
import BookCard from './BookCard.jsx'
import BookShelf from './BookShelf.jsx'
import { HeroButtons, ScreenTitle } from './BookControls.jsx'
import SidePanel from './SidePanel.jsx'
import { columnsFor, countLabel, gridMove, gridRows, rowIndexOf } from './bookGrid.js'
import { bookPointer, heroButtons, showsWhole } from './bookParts.js'
import { ellipsize, lineCount, textWidth } from './bookText.js'
import {
  AUDIOBOOK_GENRES_KEY,
  AUDIOBOOK_GENRE_POOL,
  BOOK_SUBJECTS_KEY,
  BOOK_SUBJECT_POOL,
  DEFAULT_AUDIOBOOK_GENRES,
  DEFAULT_BOOK_SUBJECTS,
  loadDiscoverDetails,
  loadSubject,
  pickedSubjects,
  searchDiscover,
  subjectLabel,
} from './bookDiscover.js'

const CARD_W = 170
const HEADER_H = 238.2
const SEARCH_DELAY = 500
const TICKS_PER_SECOND = 10000000
const SHELF_PAD = 12
const SHELF_PADS = [SHELF_PAD, 60, SHELF_PAD, 6]
const CLEAR = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }
const NO_HERO = { none: true, k: '', image: '', icon: '', coverH: 0, coverY: 0, infoY: 0, infoW: 0, h: 0, buttons: [], buttonsY: 0 }
const NO_DETAIL = { none: true, image: '', icon: '', coverH: 0, h: 0, textW: 0, tags: [], buttons: [], buttonsY: 0 }

const sourceName = (book) => (book.source === 'librivox' ? 'LibriVox' : 'Open Library')
const metaOf = (book) => [book.author, book.year ? String(book.year) : ''].filter(Boolean).join(' · ')

// A free title drawn like the library's own book cards.
const discoverCard = (book, i, w) => {
  const square = book.source === 'librivox'
  return {
    key: book.id + ':' + i,
    raw: book,
    idx: i,
    w,
    h: square ? w : w * 1.5,
    image: book.coverUrl || '',
    placeholder: square ? 'book_headphones_rounded' : 'book_menu_book_rounded',
    format: '',
    time: '',
    progress: 0,
    number: '',
    upNext: '',
    finished: false,
    title: ellipsize(book.title, 20, 'bold', w),
    titleFont: fontFor(book.title, 'bold'),
    subtitle: ellipsize(book.author || '', 16, 'regular', w),
    subtitleFont: fontFor(book.author || ''),
  }
}

// Titles open their details over the screen. The host gets onScreenLeft() and onScreenUp(), and
// the node has land().
export default function DiscoverScreen(props) {
  const [stored, setStored] = createSignal(null)
  const [subject, setSubject] = createSignal('')
  const [shelves, setShelves] = createSignal({})
  const [text, setText] = createSignal('')
  const [results, setResults] = createSignal(null)
  const [details, setDetails] = createSignal(null)
  const [detailsFull, setDetailsFull] = createSignal(null)
  const [picking, setPicking] = createSignal(false)
  const [typing, setTyping] = createSignal(false)
  const [featuredOverview, setFeaturedOverview] = createSignal('')
  const [zone, setZone] = createSignal('search')
  const [ccur, setCcur] = createSignal(0)
  const [shelf, setShelf] = createSignal(0)
  const [col, setCol] = createSignal(0)
  const [rcur, setRcur] = createSignal(0)
  const [scrollY, setScrollY] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const asked = {}
  let searchTimer = null
  let searchToken = 0
  let root
  let kb
  let picker = null
  onCleanup(() => clearTimeout(searchTimer))
  const boldFont = uiFont('bold')
  const textFont = uiFont()
  const look = () => props.look
  // Focus is the screen's own, not the picker's or the keyboard's.
  const own = () => has() && !picking() && !typing()
  const cw = () => 1920 - (props.railW || 0)
  const audio = () => isAudiobookLibrary(props.library)
  const pool = () => (audio() ? AUDIOBOOK_GENRE_POOL : BOOK_SUBJECT_POOL)
  const subjects = createMemo(() => pickedSubjects(stored(), pool(), audio() ? DEFAULT_AUDIOBOOK_GENRES : DEFAULT_BOOK_SUBJECTS))
  const query = () => text().trim()
  const count = () => {
    if (query()) return results() && results().length ? countLabel(results().length, $L('1 result'), $L('{count} results')) : ''
    return $L('Free public domain books')
  }
  const placeholder = () => (audio() ? $L('Search LibriVox') : $L('Search Open Library'))
  // The subject chips: All Subjects, the picked ones, then Edit.
  const chips = createMemo(() => {
    let x = 0
    const list = [''].concat(subjects()).map((name, i) => {
      const label = name ? subjectLabel(name) : $L('All Subjects')
      const w = Math.ceil(textWidth(label, 15, 'bold')) + 50
      const out = { k: name || 'all', i, name, label, x, w, current: name === subject(), icon: '' }
      x += w + 10
      return out
    })
    list.push({ k: 'edit', i: list.length, name: null, label: '', x, w: 64, current: false, icon: 'core_edit' })
    return list
  })
  const chipList = keyed(chips, (c) => c.k)
  const shown = createMemo(() => (subject() === '' ? subjects() : subjects().filter((name) => name === subject())))
  const featured = createMemo(() => {
    if (subject() !== '') return null
    const first = shelves()[subjects()[0]]
    return (first && first[0]) || null
  })
  const empty = createMemo(() => {
    if (query()) return !!(results() && results().length === 0)
    return shown().every((name) => shelves()[name] && shelves()[name].length === 0)
  })
  const hero = createMemo(() => {
    const book = featured()
    if (!book || query()) return NO_HERO
    const square = book.source === 'librivox'
    const infoW = cw() - 120 - 72 - 210 - 42
    const titleLines = Math.max(1, lineCount(book.title, 52, 'bold', infoW, 2))
    const overview = featuredOverview() || ''
    const overviewLines = overview ? lineCount(overview, 21, 'regular', infoW, 3) : 0
    const infoH = 33 + 8 + 54.6 * titleLines + 6 + 33 + (overview ? 14 + 29.4 * overviewLines : 0) + 28 + 52
    const coverH = square ? 210 : 315
    const h = 72 + Math.max(coverH, infoH)
    return {
      none: false,
      k: book.id,
      image: book.coverUrl || '',
      icon: square ? 'book_headphones_rounded' : 'book_menu_book_rounded',
      coverH,
      coverY: 36 + (h - 72 - coverH),
      infoY: 36 + (h - 72 - infoH),
      infoW,
      h,
      eyebrow: ($L('Featured') + ' · ' + sourceName(book)).toUpperCase(),
      title: book.title,
      titleFont: fontFor(book.title, 'bold'),
      meta: ellipsize(metaOf(book), 21, 'regular', infoW),
      metaFont: fontFor(metaOf(book)),
      metaY: 33 + 8 + 54.6 * titleLines + 6,
      overview,
      overviewFont: fontFor(overview),
      overviewY: 33 + 8 + 54.6 * titleLines + 6 + 33 + 14,
      buttonsY: infoH - 52,
      buttons: heroButtons([{ id: 'details', label: $L('Details'), icon: 'core_info_outline', primary: true }]),
    }
  })
  // Everything under the header, in the scroller's coordinates.
  const blocks = createMemo(() => {
    let y = 0
    const out = { heroY: -1, sections: [], grid: null }
    if (query()) {
      const res = results()
      if (res && res.length) {
        const cols = columnsFor(CARD_W + 40, 120, 30, props.railW || 0)
        const rows = gridRows(res.length, cols.columns)
        const cards = res.map((book, i) => discoverCard(book, i, cols.width))
        let ry = 24
        const placed = []
        rows.forEach((row) => {
          let h = 0
          for (let i = row.start; i < row.end; i++) h = Math.max(h, cards[i].h + 78)
          for (let i = row.start; i < row.end; i++) placed.push({ k: cards[i].key, i, card: cards[i], x: 60 + (i - row.start) * (cols.width + 30), y: ry + h - (cards[i].h + 78), h })
          ry += h + 24
        })
        out.grid = { rows, placed, height: ry }
        y = ry
      }
    } else if (!empty()) {
      if (!hero().none) {
        out.heroY = 24
        y = 24 + hero().h
      }
      shown().forEach((name, s) => {
        const books = shelves()[name]
        const cards = books ? books.map((book, i) => discoverCard(book, i, CARD_W)) : null
        const shelfH = cards ? SHELF_PAD * 2 + cards.reduce((h, c) => Math.max(h, c.h + 78), 0) : 0
        out.sections.push({ k: name, s, y, title: subjectLabel(name), titleFont: fontFor(subjectLabel(name), 'bold'), cards: cards || [], loading: !cards, shelfH })
        y += 24 + 33 + (cards ? shelfH : 45)
      })
    }
    out.height = y + 60
    return out
  })
  const sections = keyed(() => blocks().sections, (s) => s.k)
  const resultList = keyed(() => (blocks().grid ? blocks().grid.placed : []), (p) => p.k)
  const isRcur = createSelector(rcur)
  const isCcur = createSelector(ccur)
  const detail = createMemo(() => {
    const d = details()
    const book = detailsFull() || (d && d.book)
    if (!book) return NO_DETAIL
    const isAudio = book.source === 'librivox'
    const textW = 1380 - 96 - 210 - 42
    const facts = [book.sections ? countLabel(book.sections, $L('1 section'), $L('{count} sections')) : '', formatDuration((book.seconds || 0) * TICKS_PER_SECOND)]
      .filter(Boolean)
      .join(' · ')
    const overview = book.overview || (detailsFull() ? $L('No description available.') : $L('Loading...'))
    const titleLines = Math.max(1, lineCount(book.title, 52, 'bold', textW, 2))
    const overviewLines = Math.max(1, lineCount(overview, 22, 'regular', textW, 9))
    const readers = book.readers && book.readers.length ? $L('Read by {names}').replace('{names}', book.readers.slice(0, 4).join(', ')) : ''
    let y = 33 + 8 + 54.6 * titleLines + 6
    const metaY = y
    y += 33
    const factsY = y + 6
    if (facts) y += 6 + 33
    const overviewY = y + 18
    y += 18 + 31.9 * overviewLines
    const readersY = y + 6
    if (readers) y += 6 + 33
    let tx = 0
    let ty = 0
    const tags = (book.tags || []).map((tag) => {
      const w = Math.ceil(textWidth(tag, 17)) + 28
      if (tx + w > textW && tx > 0) {
        tx = 0
        ty += 45 + 10
      }
      const out = { k: tag, label: tag, x: tx, y: ty, w }
      tx += w + 10
      return out
    })
    const tagsY = y + 18
    if (tags.length) y += 18 + ty + 45 + 10
    const buttonsY = y + 28
    y += 28 + 52
    return {
      none: false,
      image: book.coverUrl || '',
      icon: isAudio ? 'book_headphones_rounded' : 'book_menu_book_rounded',
      coverH: isAudio ? 210 : 315,
      h: Math.min(860, 96 + Math.max(isAudio ? 210 : 315, y)),
      textW,
      eyebrow: sourceName(book).toUpperCase(),
      title: book.title,
      titleFont: fontFor(book.title, 'bold'),
      meta: ellipsize(metaOf(book), 21, 'regular', textW),
      metaFont: fontFor(metaOf(book)),
      metaY,
      facts,
      factsY,
      overview,
      overviewFont: fontFor(overview),
      overviewY,
      readers: ellipsize(readers, 19, 'regular', textW),
      readersY,
      tags,
      tagsY,
      buttonsY,
      buttons: heroButtons([{ id: 'close', label: $L('Close') }]),
    }
  })
  const tagList = keyed(() => detail().tags, (t) => t.k)
  const pickerOptions = createMemo(() => pool().map((name) => ({ id: name, label: subjectLabel(name), on: subjects().indexOf(name) >= 0 })))
  const chipGlow = () => ({ color: shadowColor(look().accent45), x: 0, y: 0, blur: 14, spread: 1 })

  createEffect(
    on(featured, (book) => {
      setFeaturedOverview((book && book.overview) || '')
      if (!book || book.overview) return
      loadDiscoverDetails(book).then((f) => {
        if (featured() === book) setFeaturedOverview(f.overview || '')
      })
    }),
  )
  const loadShelves = () => {
    subjects().forEach((name) => {
      if (asked[name]) return
      asked[name] = true
      loadSubject(name, audio())
        .then((books) => {
          setShelves({ ...shelves(), [name]: books })
        })
        .catch(() => setShelves({ ...shelves(), [name]: [] }))
    })
  }
  onMount(async () => {
    setStored(await getFromStorage(audio() ? AUDIOBOOK_GENRES_KEY : BOOK_SUBJECTS_KEY).catch(() => null))
    loadShelves()
  })

  const reveal = () => {
    const b = blocks()
    let top = null
    let h = 0
    if (zone() === 'hero' && b.heroY >= 0) {
      top = b.heroY + hero().infoY + hero().buttonsY
      h = 52
    } else if (zone() === 'shelf') {
      const sec = b.sections[shelf()]
      if (sec) {
        top = sec.y + 57
        h = sec.shelfH
      }
    } else if (zone() === 'results' && b.grid) {
      const p = b.grid.placed[rcur()]
      if (p) {
        top = p.y
        h = p.card.h + 78
      }
    }
    if (top == null) return
    const view = props.viewH - HEADER_H
    setScrollY(focusScroll(top, h, scrollY(), view, Math.max(0, b.height - view)))
  }
  // Lands on what's at the top: the featured title, the first shelf or result, or the search field
  // while nothing's loaded yet.
  const land = () => {
    const ready = shown().some((name) => shelves()[name])
    if (!ready && !query()) {
      setZone('search')
      return
    }
    const b = blocks()
    batch(() => {
      if (b.heroY >= 0) setZone('hero')
      else if (b.sections.some((s) => s.cards.length)) {
        setZone('shelf')
        setShelf(b.sections.findIndex((s) => s.cards.length))
        setCol(0)
      } else if (b.grid) {
        setZone('results')
        setRcur(0)
      } else setZone('search')
    })
    reveal()
  }
  // Down from the subjects goes into the content, Up from its top back to them.
  const intoContent = () => {
    const before = zone()
    land()
    if (zone() === 'search') setZone(before)
  }
  const openDetails = (book) => {
    batch(() => {
      setDetails({ book, from: zone() })
      setDetailsFull(null)
      setZone('details')
    })
    loadDiscoverDetails(book).then((f) => {
      if (details() && details().book === book) setDetailsFull(f)
    })
  }
  const closeDetails = () => {
    const from = details() && details().from
    batch(() => {
      setDetails(null)
      setZone(from || 'hero')
    })
  }
  const openPicker = () => {
    setPicking(true)
    if (picker) picker.setFocus()
  }
  const onPanelPick = (option) => {
    const name = option.id
    const next = subjects().indexOf(name) >= 0 ? subjects().filter((s) => s !== name) : subjects().concat(name)
    if (next.length) {
      setStored(next)
      saveToStorage(audio() ? AUDIOBOOK_GENRES_KEY : BOOK_SUBJECTS_KEY, next).catch(() => {})
      loadShelves()
    }
    if (next.indexOf(subject()) < 0) setSubject('')
  }
  const onPanelClose = () => {
    batch(() => {
      setPicking(false)
      setZone('chips')
      setCcur(chips().length - 1)
    })
    root.setFocus()
  }
  // Typing waits for a pause before it searches, and a newer search wins over an older one.
  const search = () => {
    setResults(null)
    clearTimeout(searchTimer)
    const q = query()
    if (!q) return
    const token = ++searchToken
    searchTimer = setTimeout(() => {
      searchDiscover(q, audio()).then(
        (books) => token === searchToken && setResults(books),
        () => token === searchToken && setResults([]),
      )
    }, SEARCH_DELAY)
  }
  const onKeyboardChange = (value) => {
    setText(value)
    search()
  }
  const openKeyboard = () => {
    setTyping(true)
    // Keyboard Style set to Native hands the field to the TV's own keyboard.
    if (usesNativeKeyboard()) {
      const opened = openNativeInput({
        value: text(),
        rect: { x: (props.railW || 0) + 60, y: (props.top || 0) + 91.2, w: cw() - 120, h: 66 },
        onChange: onKeyboardChange,
        onClose: (submitted, key) => {
          setTyping(false)
          if (key === 'up') return props.host.onScreenUp()
          if (key === 'down') setZone('chips')
          root.setFocus()
        },
      })
      if (!opened) setTyping(false)
      return
    }
    kb.open({ value: text(), purpose: 'search' })
    kb.setFocus()
  }
  const contentUp = () => {
    batch(() => {
      setZone('chips')
      setCcur(Math.max(0, chips().findIndex((c) => c.current)))
    })
  }
  const prevShelf = () => {
    const secs = blocks().sections
    for (let i = shelf() - 1; i >= 0; i--) if (secs[i].cards.length) return i
    return -1
  }
  const up = () => {
    const z = zone()
    if (z === 'details') return
    if (z === 'chips') return setZone('search')
    if (z === 'search') return props.host.onScreenUp()
    if (z === 'hero') return contentUp()
    if (z === 'shelf') {
      const prev = prevShelf()
      if (prev >= 0) {
        batch(() => {
          setShelf(prev)
          setCol(Math.min(col(), blocks().sections[prev].cards.length - 1))
        })
      } else if (blocks().heroY >= 0) setZone('hero')
      else return contentUp()
      return reveal()
    }
    if (z === 'results') {
      const rows = blocks().grid.rows
      const next = gridMove(rows, rowIndexOf(rows, rcur()), rcur(), 'up')
      if (next == null) return contentUp()
      setRcur(next)
      reveal()
    }
  }
  const down = () => {
    const z = zone()
    if (z === 'details') return
    if (z === 'search') {
      batch(() => {
        setZone('chips')
        setCcur(Math.max(0, chips().findIndex((c) => c.current)))
      })
      return
    }
    if (z === 'chips') return intoContent()
    if (z === 'hero') {
      const first = blocks().sections.findIndex((s) => s.cards.length)
      if (first >= 0) {
        batch(() => {
          setZone('shelf')
          setShelf(first)
          setCol(0)
        })
        reveal()
      }
      return
    }
    if (z === 'shelf') {
      const next = blocks().sections.findIndex((s, i) => i > shelf() && s.cards.length)
      if (next >= 0) {
        batch(() => {
          setShelf(next)
          setCol(Math.min(col(), blocks().sections[next].cards.length - 1))
        })
        reveal()
      }
      return
    }
    if (z === 'results') {
      const rows = blocks().grid.rows
      const next = gridMove(rows, rowIndexOf(rows, rcur()), rcur(), 'down')
      if (next != null) {
        setRcur(next)
        reveal()
      }
    }
  }
  const left = () => {
    const z = zone()
    if (z === 'details') return
    if (z === 'chips') {
      if (ccur() > 0) setCcur(ccur() - 1)
      else props.host.onScreenLeft()
    } else if (z === 'shelf' && col() > 0) {
      setCol(col() - 1)
      reveal()
    } else if (z === 'results') {
      const rows = blocks().grid.rows
      const next = gridMove(rows, rowIndexOf(rows, rcur()), rcur(), 'left')
      if (next != null) setRcur(next)
      else props.host.onScreenLeft()
    } else props.host.onScreenLeft()
  }
  const right = () => {
    const z = zone()
    if (z === 'chips' && ccur() < chips().length - 1) setCcur(ccur() + 1)
    else if (z === 'shelf') {
      const sec = blocks().sections[shelf()]
      if (sec && col() < sec.cards.length - 1) {
        setCol(col() + 1)
        reveal()
      }
    } else if (z === 'results') {
      const rows = blocks().grid.rows
      const next = gridMove(rows, rowIndexOf(rows, rcur()), rcur(), 'right')
      if (next != null) setRcur(next)
    }
  }
  const enter = () => {
    const z = zone()
    if (z === 'search') return openKeyboard()
    if (z === 'chips') {
      const chip = chips()[ccur()]
      if (!chip) return
      if (chip.name === null) return openPicker()
      batch(() => {
        setSubject(chip.name)
        setScrollY(0)
      })
      return
    }
    if (z === 'hero' && featured()) return openDetails(featured())
    if (z === 'shelf') {
      const sec = blocks().sections[shelf()]
      const card = sec && sec.cards[col()]
      if (card) openDetails(card.raw)
      return
    }
    if (z === 'results') {
      const p = blocks().grid.placed[rcur()]
      if (p) openDetails(p.card.raw)
      return
    }
    if (z === 'details') closeDetails()
  }
  // The Magic Remote's cursor (app/pointer.js): the search field and the chips take focus on hover,
  // and the featured title's button, a shelf's book or a result while in full view; one the page or
  // its shelf would scroll to takes it on a click.
  const point = bookPointer(props, has)
  const busy = () => picking() || typing() || !!details()
  const shows = (top, h) => showsWhole(top, h, scrollY(), props.viewH - HEADER_H)
  const pointTo = (z, set, click, whole = true, lit = false) => {
    if (busy()) return false
    return point(
      () => {
        batch(() => {
          setZone(z)
          if (set) set()
        })
        reveal()
      },
      { whole, lit: own() && lit, click },
    )
  }
  const pointHero = (click) => {
    const b = blocks()
    return pointTo('hero', null, click, b.heroY >= 0 && shows(b.heroY + hero().infoY + hero().buttonsY, 52), zone() === 'hero')
  }
  const pointShelf = (s, i, o) => {
    const sec = blocks().sections[s]
    if (!sec || !sec.cards[i]) return false
    return pointTo(
      'shelf',
      () => {
        setShelf(s)
        setCol(i)
      },
      o.click,
      o.whole && shows(sec.y + 57, sec.shelfH),
      zone() === 'shelf' && shelf() === s && col() === i,
    )
  }
  const pointResult = (i, click) => {
    const p = blocks().grid && blocks().grid.placed[i]
    if (!p) return false
    return pointTo('results', () => setRcur(i), click, shows(p.y, p.card.h + 78), zone() === 'results' && rcur() === i)
  }
  const key = (fn) => () => {
    fn()
    return true
  }
  const searchFocused = () => zone() === 'search' && own()
  const chipFocus = () => (zone() === 'chips' && own() ? ccur() : -1)

  return (
    <view
      ref={(n) => {
        root = n
        n.land = land
        n.landControls = () => {
          setZone('search')
          return true
        }
        if (props.ref) props.ref(n)
      }}
      width={cw()}
      height={props.viewH}
      onFocusChanged={setHas}
      onUp={key(up)}
      onDown={key(down)}
      onLeft={key(left)}
      onRight={key(right)}
      onEnter={key(enter)}
      onBack={() => {
        // Back closes the details first.
        if (!details()) return false
        closeDetails()
        return true
      }}
    >
      <ScreenTitle title={$L('Discover')} count={count()} look={look()} />
      <view x={60} y={91.2} width={cw() - 120} height={66} onPointerOver={() => pointTo('search', null, false, true, zone() === 'search')}>
        <view width={cw() - 120} height={66} borderRadius={33} color={look().os08} />
        <view width={cw() - 120} height={66} borderRadius={33} color={CLEAR} border={{ width: 3, color: hex(look().focus) }} alpha={searchFocused() ? 1 : 0} />
        <text fontFamily={fontFor(text() || placeholder())} fontSize={24} x={33} y={20} color={text() ? look().onSurface : look().os50}>
          {text() || placeholder()}
        </text>
      </view>
      <view x={60} y={175.2} width={cw() - 60} height={57}>
        <For each={chipList.keys()}>
          {(k) => {
            const ch = chipList.item(k)
            const lit = () => chipFocus() >= 0 && isCcur(ch().i)
            return (
              <view x={ch().x} width={ch().w} height={57} onPointerOver={() => pointTo('chips', () => setCcur(ch().i), false, true, zone() === 'chips' && ccur() === ch().i)}>
                <view width={ch().w} height={57} borderRadius={22} color={CLEAR} shadow={chipGlow()} alpha={lit() ? 1 : 0} />
                <view width={ch().w} height={57} borderRadius={22} color={lit() ? look().accent : ch().current ? look().accent16 : look().os09} />
                <text fontFamily={boldFont} fontSize={15} x={30} y={21} color={lit() ? look().onAccent : ch().current ? look().accent : look().os80}>
                  {ch().label}
                </text>
                <Show when={ch().icon}>
                  <view x={20} y={16.5} width={24} height={24} src={'icons/' + ch().icon + '.webp'} color={lit() ? look().onAccent : look().os80} />
                </Show>
              </view>
            )
          }}
        </For>
      </view>

      <view y={HEADER_H} width={cw()} height={props.viewH - HEADER_H} clipping>
        <view y={-scrollY()} width={cw()} height={Math.max(props.viewH, blocks().height)}>
          <view x={60} y={Math.max(0, blocks().heroY)} width={cw() - 120} height={hero().h} alpha={blocks().heroY >= 0 ? 1 : 0}>
            <view width={cw() - 120} height={hero().h} borderRadius={24} color={look().os06} />
            <view x={36} y={hero().coverY} width={210} height={hero().coverH} borderRadius={12} color={look().os08}>
              <Show
                when={hero().image}
                fallback={<view x={63} y={(hero().coverH - 84) / 2} width={84} height={84} src={'icons/' + (hero().icon || 'book_menu_book_rounded') + '.webp'} color={look().os35} />}
              >
                <view width={210} height={hero().coverH} borderRadius={12} src={hero().image} textureOptions={COVER} />
              </Show>
            </view>
            <view x={288} y={hero().infoY}>
              <text fontFamily={boldFont} fontSize={18} letterSpacing={1} y={7} color={look().accent}>
                {hero().eyebrow || ''}
              </text>
              <text
                fontFamily={hero().titleFont || 'roboto-bold'}
                fontSize={52}
                lineHeight={54.6}
                letterSpacing={-1}
                y={43}
                maxWidth={hero().infoW || 1}
                maxLines={2}
                color={look().onSurface}
              >
                {hero().title || ''}
              </text>
              <text fontFamily={hero().metaFont || 'roboto'} fontSize={21} y={(hero().metaY || 0) + 5} color={look().os75}>
                {hero().meta || ''}
              </text>
              <text
                fontFamily={hero().overviewFont || 'roboto'}
                fontSize={21}
                lineHeight={29.4}
                y={(hero().overviewY || 0) + 2}
                maxWidth={hero().infoW || 1}
                maxLines={3}
                color={look().os75}
              >
                {hero().overview || ''}
              </text>
              <HeroButtons
                y={hero().buttonsY}
                buttons={hero().buttons}
                focus={zone() === 'hero' && own() ? 0 : -1}
                look={look()}
                onPointerButton={() => pointHero(false)}
                onPointerButtonClick={() => pointHero(true)}
              />
            </view>
          </view>
          <view>
            <For each={sections.keys()}>
              {(k) => {
                const sec = sections.item(k)
                return (
                  <view x={60} y={sec().y} width={cw() - 60} height={57 + Math.max(45, sec().shelfH)}>
                    <text fontFamily={sec().titleFont} fontSize={28} y={28} color={look().onSurface}>
                      {sec().title}
                    </text>
                    <text fontFamily={textFont} fontSize={20} x={12} y={73} color={look().os50} alpha={sec().loading ? 1 : 0}>
                      {$L('Loading...')}
                    </text>
                    <BookShelf
                      y={57}
                      cards={sec().cards}
                      focus={zone() === 'shelf' && own() && shelf() === sec().s ? col() : -1}
                      gap={24}
                      pad={SHELF_PADS}
                      viewW={cw() - 60}
                      look={look()}
                      zoom={props.zoom}
                      onPointerCard={(i, o) => pointShelf(sec().s, i, o)}
                    />
                  </view>
                )
              }}
            </For>
          </view>
          <view>
            <For each={resultList.keys()}>
              {(k) => {
                const rc = resultList.item(k)
                return (
                  <BookCard
                    x={rc().x}
                    y={rc().y}
                    card={rc().card}
                    look={look()}
                    zoom={props.zoom}
                    focused={zone() === 'results' && own() && isRcur(rc().i)}
                    onPointerOver={() => pointResult(rc().i, false)}
                    onPointerClick={() => pointResult(rc().i, true)}
                  />
                )
              }}
            </For>
          </view>
          <view>
            <Show when={empty()}>
              <text fontFamily={textFont} fontSize={20} x={cw() / 2} y={54} mountX={0.5} color={look().os50}>
                {$L('No items found')}
              </text>
            </Show>
            <Show when={query() && !results()}>
              <text fontFamily={textFont} fontSize={20} x={12} y={18} color={look().os50}>
                {$L('Loading...')}
              </text>
            </Show>
          </view>
        </view>
      </view>

      {/* The details, the picker and the keyboard cover the whole screen, the rail and strip included. */}
      <view x={-(props.railW || 0)} y={-(props.top || 0)} width={1920} height={1080}>
        <Show when={details()}>
          <view width={1920} height={1080}>
            <view width={1920} height={1080} color="#000000b3" />
            <view x={270} y={(1080 - detail().h) / 2} width={1380} height={detail().h} borderRadius={30} color={look().surface}>
              <view x={48} y={48} width={210} height={detail().coverH} borderRadius={12} color={look().os08}>
                <Show
                  when={detail().image}
                  fallback={<view x={63} y={(detail().coverH - 84) / 2} width={84} height={84} src={'icons/' + detail().icon + '.webp'} color={look().os35} />}
                >
                  <view width={210} height={detail().coverH} borderRadius={12} src={detail().image} textureOptions={COVER} />
                </Show>
              </view>
              <view x={300} y={48} width={detail().textW} height={detail().h - 96} clipping>
                <text fontFamily={boldFont} fontSize={18} letterSpacing={1} y={7} color={look().accent}>
                  {detail().eyebrow}
                </text>
                <text fontFamily={detail().titleFont} fontSize={52} lineHeight={54.6} letterSpacing={-1} y={43} maxWidth={detail().textW} maxLines={2} color={look().onSurface}>
                  {detail().title}
                </text>
                <text fontFamily={detail().metaFont} fontSize={21} y={detail().metaY + 5} color={look().os75}>
                  {detail().meta}
                </text>
                <text fontFamily={textFont} fontSize={19} y={detail().factsY + 6} color={look().os65}>
                  {detail().facts}
                </text>
                <text
                  fontFamily={detail().overviewFont}
                  fontSize={22}
                  lineHeight={31.9}
                  y={detail().overviewY + 2}
                  maxWidth={detail().textW}
                  maxLines={9}
                  color={look().os80}
                >
                  {detail().overview}
                </text>
                <text fontFamily={textFont} fontSize={19} y={detail().readersY + 6} color={look().os65}>
                  {detail().readers}
                </text>
                <view y={detail().tagsY}>
                  <For each={tagList.keys()}>
                    {(k) => {
                      const tg = tagList.item(k)
                      return (
                        <view x={tg().x} y={tg().y} width={tg().w} height={45} borderRadius={14} color={look().os08}>
                          <text fontFamily={textFont} fontSize={17} x={14} y={13} color={look().os80}>
                            {tg().label}
                          </text>
                        </view>
                      )
                    }}
                  </For>
                </view>
                <HeroButtons y={detail().buttonsY} buttons={detail().buttons} focus={zone() === 'details' && own() ? 0 : -1} look={look()} />
              </view>
            </view>
          </view>
        </Show>
      </view>
      <view x={-(props.railW || 0)} y={-(props.top || 0)} width={1920} height={1080}>
        <Show when={picking()}>
          <Kept gone={() => (picker = null)}>
            <SidePanel
              ref={(n) => (picker = n)}
              title={$L('Subjects')}
              options={pickerOptions()}
              kind="check"
              start={0}
              look={look()}
              onPanelPick={onPanelPick}
              onPanelClose={onPanelClose}
            />
          </Kept>
        </Show>
      </view>
      <Keyboard
        ref={(n) => (kb = n)}
        overlay
        onKeyboardChange={onKeyboardChange}
        onKeyboardClose={() => {
          batch(() => {
            setTyping(false)
            setZone('search')
          })
          root.setFocus()
        }}
        onKeyboardNative={() => {
          setTyping(false)
          openKeyboard()
        }}
      />
    </view>
  )
}
