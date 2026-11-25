import $L from '../../../services/i18n.js'
import { For, Show, batch, createMemo, createSelector, createSignal, onCleanup, onMount } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { menuHold } from '../modals/menuHold.js'
import { focusScroll } from '../nav/focusScroll.js'
import { api } from '../../../services/jellyfinApi.js'
import { isAudiobookItem, peopleAuthors, seriesItemCountLabel } from '../../../utils/bookLibrary.js'
import { cleanOverview } from '../../../utils/overviewText.js'
import BookShelf from './BookShelf.jsx'
import { HeroButtons, ScreenTitle } from './BookControls.jsx'
import { bookCard } from './bookCards.js'
import { countLabel } from './bookGrid.js'
import { bookPointer, faceOf, heroButtons, shelfHeight, showsWhole } from './bookParts.js'
import { shuffled } from '../../../utils/shuffled.js'
import { ellipsize, lineCount, textWidth } from './bookText.js'
import { authorShelves, authorStats, bookMenuItem, booksByAuthor, isFinished } from './bookScreens.js'
import { bySortName } from './classicShelves.js'

const HEADER_H = 73.2
const ROW_H = 96
const LIST_W = 440
const CARD_W = 170
const PAD = [12, 60, 12, 6]
const SHOW_DELAY = 250
const CLEAR = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }
const NO_SPOT = {
  face: { image: '', initials: '', color: CLEAR },
  name: '',
  nameFont: 'roboto-bold',
  nameY: 0,
  bioY: 0,
  statsY: 0,
  statList: [],
  buttonsY: 0,
  headH: 0,
  faceY: 0,
  infoY: 0,
  audiobooks: [],
  books: [],
  buttons: [],
  shelves: [],
  height: 0,
}

// The author in focus shows on the right after a short pause. The host gets onScreenLeft(),
// onScreenUp(), openItem(item) and readItem(item, queue), and the node has land().
export default function AuthorsScreen(props) {
  const [artists, setArtists] = createSignal(null)
  const [shownIndex, setShownIndex] = createSignal(0)
  const [zone, setZone] = createSignal('list')
  const [cur, setCur] = createSignal(0)
  const [shelf, setShelf] = createSignal(0)
  const [col, setCol] = createSignal(0)
  const [listY, setListY] = createSignal(0)
  const [detailY, setDetailY] = createSignal(0)
  const [bio, setBio] = createSignal('')
  const [has, setHas] = createSignal(false)
  let timer = null
  let landPending = false
  onCleanup(() => clearTimeout(timer))
  const boldFont = uiFont('bold')
  const textFont = uiFont()
  const eyebrow = $L('Author').toUpperCase()
  const look = () => props.look
  const cw = () => 1920 - (props.railW || 0)
  const authors = createMemo(() => {
    const list = artists()
    if (!list) return []
    const extra = peopleAuthors(props.data.titles, list.map((a) => String(a.Name || '').toLowerCase()))
    return list.concat(extra).sort(bySortName)
  })
  const count = () => (authors().length ? countLabel(authors().length, $L('1 author'), $L('{count} authors')) : '')
  const rows = createMemo(() =>
    authors().map((author, i) => {
      const face = faceOf(author, i)
      const n = props.data.authorTitles.get(String(author.Name || '').toLowerCase()) || 0
      const name = author.Name || ''
      return Object.assign(face, {
        k: author.Id || author.Name,
        i,
        y: 18 + i * ROW_H,
        name: ellipsize(name, 22, 'bold', LIST_W - 36 - 66 - 21),
        nameFont: fontFor(name, 'bold'),
        sub: seriesItemCountLabel(n),
      })
    }),
  )
  const rowList = keyed(rows, (r) => r.k)
  const isCur = createSelector(cur)
  const listView = () => props.viewH - HEADER_H
  const shown = () => authors()[shownIndex()] || null
  const detailW = () => cw() - 60 - LIST_W - 54 - 60
  const spot = createMemo(() => {
    const author = shown()
    if (!author) return NO_SPOT
    const books = booksByAuthor(props.data.titles, author)
    const stats = authorStats(books)
    const audiobooks = books.filter(isAudiobookItem)
    const infoW = detailW() - 240 - 42
    const name = author.Name || ''
    const nameLines = Math.max(1, lineCount(name, 52, 'bold', infoW, 2))
    const bioLines = bio() ? lineCount(bio(), 21, 'regular', infoW, 2) : 0
    let y = 33 + 8
    const nameY = y
    y += 54.6 * nameLines
    const bioY = y + 14
    if (bio()) y += 14 + 29.4 * bioLines
    const statsY = y + 18
    y += 18 + 90
    const buttonsY = y + 28
    if (books.length) y += 28 + 52
    const headH = Math.max(240, y)
    const labels = [$L('Books'), $L('Audiobooks'), $L('Series')]
    const values = [stats.books, stats.audiobooks, stats.series]
    let sx = 0
    const statList = labels.map((label, i) => {
      const w = Math.max(132, Math.ceil(40 + Math.max(textWidth(String(values[i]), 30, 'bold'), textWidth(label, 18))))
      const out = { k: label, label, value: String(values[i]), x: sx, w }
      sx += w + 14
      return out
    })
    let shelfY = 33 + headH
    const shelves = authorShelves(books).map((sh, s) => {
      const cards = sh.items.map((book, i) => bookCard(book, i, CARD_W, sh.numbered ? { number: book.IndexNumber != null ? book.IndexNumber : i + 1 } : {}))
      const out = { k: sh.id, s, title: sh.title, titleFont: fontFor(sh.title, 'bold'), y: shelfY, cards }
      shelfY += 24 + 33 + shelfHeight(cards, PAD)
      return out
    })
    return {
      face: faceOf(author, shownIndex()),
      name,
      nameFont: fontFor(name, 'bold'),
      nameY,
      bioY,
      statsY,
      statList,
      buttonsY,
      headH,
      faceY: (headH - 240) / 2,
      infoY: (headH - y) / 2,
      audiobooks,
      books,
      buttons: books.length
        ? heroButtons([
            audiobooks.length
              ? { id: 'main', label: $L('Shuffle Audiobooks'), icon: 'core_shuffle', primary: true }
              : { id: 'main', label: $L('Start Reading'), icon: 'book_menu_book_rounded', primary: true },
          ])
        : [],
      shelves,
      height: shelfY + 60,
    }
  })
  const stats = keyed(() => spot().statList, (s) => s.k)
  const shelves = keyed(() => spot().shelves, (s) => s.k)

  const loadBio = async () => {
    setBio('')
    const author = shown()
    // People only named on a title carry their name as an id, so there's nothing to fetch for them.
    if (!author || !author.Id || author.Id === author.Name) return
    const id = author.Id
    try {
      const res = await api.getItem(id)
      if (shown() && shown().Id === id) setBio(cleanOverview(res && res.Overview) || '')
    } catch (e) {
      // No bio, then.
    }
  }
  const revealList = () => {
    const top = 18 + cur() * ROW_H
    setListY(focusScroll(top, ROW_H, listY(), listView(), Math.max(0, 18 + authors().length * ROW_H + 30 - listView())))
  }
  const revealDetail = () => {
    const s = spot()
    let top
    let h
    if (zone() === 'main') {
      top = 33 + s.infoY + s.buttonsY
      h = 52
    } else {
      const sh = s.shelves[shelf()]
      if (!sh) return
      top = sh.y + 57
      h = shelfHeight(sh.cards, PAD)
    }
    setDetailY(focusScroll(top, h, detailY(), listView(), Math.max(0, s.height - listView())))
  }
  const land = () => {
    if (artists() === null) {
      landPending = true
      return
    }
    landPending = false
    batch(() => {
      setZone('list')
      setCur(shownIndex())
    })
    revealList()
  }
  onMount(async () => {
    try {
      const res = await api.getArtists({ ParentId: props.library.Id, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'PrimaryImageAspectRatio,SortName' })
      setArtists((res && res.Items) || [])
    } catch (e) {
      setArtists([])
    }
    loadBio()
    if (landPending) land()
  })
  const show = (i) => {
    clearTimeout(timer)
    timer = null
    if (i === shownIndex()) return
    batch(() => {
      setShownIndex(i)
      setDetailY(0)
    })
    loadBio()
  }
  // Right, or Select, shows the author in focus straight away and goes to their button.
  const showNow = () => {
    show(cur())
    const s = spot()
    if (s.buttons.length) setZone('main')
    else if (s.shelves.length) {
      batch(() => {
        setZone('shelf')
        setShelf(0)
        setCol(0)
      })
    }
    revealDetail()
  }
  const queueShow = () => {
    clearTimeout(timer)
    timer = setTimeout(() => show(cur()), SHOW_DELAY)
  }
  const focusShownRow = () => {
    batch(() => {
      setZone('list')
      setCur(shownIndex())
    })
    revealList()
  }
  const main = () => {
    const s = spot()
    if (s.audiobooks.length) {
      const queue = shuffled(s.audiobooks)
      props.host.readItem(queue[0], queue)
    } else {
      const next = s.books.find((book) => !isFinished(book)) || s.books[0]
      if (next) props.host.readItem(next)
    }
  }
  // The Magic Remote's cursor (app/pointer.js): an author, the button or a book in full view takes
  // focus on hover; one its column or shelf would scroll to takes it on a click.
  const point = bookPointer(props, has)
  const pointRow = (i, click) =>
    point(
      () => {
        setZone('list')
        setCur(i)
        revealList()
        queueShow()
      },
      { whole: showsWhole(18 + i * ROW_H, ROW_H, listY(), listView()), lit: has() && zone() === 'list' && cur() === i, click },
    )
  const pointMain = (click) => {
    const s = spot()
    return point(
      () => {
        setZone('main')
        revealDetail()
      },
      { whole: showsWhole(33 + s.infoY + s.buttonsY, 52, detailY(), listView()), lit: has() && zone() === 'main', click },
    )
  }
  const pointCard = (s, i, o) => {
    const sh = spot().shelves[s]
    if (!sh || !sh.cards[i]) return false
    return point(
      () => {
        batch(() => {
          setZone('shelf')
          setShelf(s)
          setCol(i)
        })
        revealDetail()
      },
      { whole: o.whole && showsWhole(sh.y + 57, shelfHeight(sh.cards, PAD), detailY(), listView()), lit: has() && zone() === 'shelf' && shelf() === s && col() === i, click: o.click },
    )
  }
  const up = () => {
    if (zone() === 'list') {
      if (cur() > 0) {
        setCur(cur() - 1)
        revealList()
        queueShow()
      } else props.host.onScreenUp()
    } else if (zone() === 'main') props.host.onScreenUp()
    else if (zone() === 'shelf') {
      if (shelf() > 0) {
        batch(() => {
          setShelf(shelf() - 1)
          setCol(Math.min(col(), spot().shelves[shelf()].cards.length - 1))
        })
      } else if (spot().buttons.length) setZone('main')
      else props.host.onScreenUp()
      revealDetail()
    }
  }
  const down = () => {
    if (zone() === 'list') {
      if (cur() < authors().length - 1) {
        setCur(cur() + 1)
        revealList()
        queueShow()
      }
    } else if (zone() === 'main') {
      if (spot().shelves.length) {
        batch(() => {
          setZone('shelf')
          setShelf(0)
          setCol(0)
        })
        revealDetail()
      }
    } else if (zone() === 'shelf' && shelf() < spot().shelves.length - 1) {
      batch(() => {
        setShelf(shelf() + 1)
        setCol(Math.min(col(), spot().shelves[shelf()].cards.length - 1))
      })
      revealDetail()
    }
  }
  const left = () => {
    if (zone() === 'list') props.host.onScreenLeft()
    else if (zone() === 'main') focusShownRow()
    else if (zone() === 'shelf') {
      if (col() > 0) setCol(col() - 1)
      else focusShownRow()
    }
  }
  const right = () => {
    if (zone() === 'list') showNow()
    else if (zone() === 'shelf') {
      const sh = spot().shelves[shelf()]
      if (sh && col() < sh.cards.length - 1) setCol(col() + 1)
    }
  }
  const enter = () => {
    if (zone() === 'list') showNow()
    else if (zone() === 'main') main()
    else if (zone() === 'shelf') {
      const card = spot().shelves[shelf()].cards[col()]
      if (card) props.host.openItem(card.raw)
    }
  }
  const heldItem = () => {
    if (zone() !== 'shelf') return null
    const sh = spot().shelves[shelf()]
    return sh && sh.cards[col()] ? bookMenuItem(sh.cards[col()].raw) : null
  }
  const hold = menuHold(heldItem, enter)
  const key = (fn) => () => {
    fn()
    return true
  }
  return (
    <view
      ref={(n) => {
        n.land = land
        if (props.ref) props.ref(n)
      }}
      width={cw()}
      height={props.viewH}
      onFocusChanged={setHas}
      onCaptureEnter={hold.down}
      onCaptureEnterRelease={hold.up}
      onMenu={hold.menu}
      onUp={key(up)}
      onDown={key(down)}
      onLeft={key(left)}
      onRight={key(right)}
      onEnter={key(enter)}
    >
      <ScreenTitle title={$L('Authors')} count={count()} look={look()} />
      <view>
        <Show when={artists() !== null && !authors().length}>
          <text fontFamily={textFont} fontSize={20} x={cw() / 2} y={127} mountX={0.5} color={look().os50}>
            {$L('No items found')}
          </text>
        </Show>
      </view>
      <view y={HEADER_H} width={cw()} height={listView()} alpha={authors().length ? 1 : 0}>
        <view x={60} width={LIST_W} height={listView()} clipping>
          <view y={-listY()} width={LIST_W} height={Math.max(listView(), 18 + authors().length * ROW_H + 30)}>
            <For each={rowList.keys()}>
              {(k) => {
                const ar = rowList.item(k)
                const lit = () => zone() === 'list' && has() && isCur(ar().i)
                return (
                  <view y={ar().y} width={LIST_W} height={ROW_H} onPointerOver={() => pointRow(ar().i, false)} onPointerClick={() => pointRow(ar().i, true)}>
                    {/* The focus fill replaces the shown row's tint. */}
                    <view width={LIST_W} height={ROW_H} borderRadius={18} color={ar().i === shownIndex() && !lit() ? look().accent16 : CLEAR} />
                    <view width={LIST_W} height={ROW_H} borderRadius={18} color={look().os12} alpha={lit() ? 1 : 0} />
                    <view width={LIST_W} height={ROW_H} borderRadius={18} color={CLEAR} border={{ width: 3, color: hex(look().focus) }} alpha={lit() ? 1 : 0} />
                    <view x={18} y={15} width={66} height={66} borderRadius={33} color={ar().image ? look().os06 : ar().color}>
                      <text fontFamily={boldFont} fontSize={23.76} x={33} mountX={0.5} y={20} color="#ffffff">
                        {ar().initials}
                      </text>
                      <Show when={ar().image}>
                        <view width={66} height={66} borderRadius={33} src={ar().image} textureOptions={COVER} />
                      </Show>
                    </view>
                    <text fontFamily={ar().nameFont} fontSize={22} x={105} y={16} color={look().onSurface}>
                      {ar().name}
                    </text>
                    <text fontFamily={textFont} fontSize={19} x={105} y={57} color={look().os65}>
                      {ar().sub}
                    </text>
                    <view width={LIST_W} height={ROW_H} onPointerOver={() => pointRow(ar().i, false)} onPointerClick={() => pointRow(ar().i, true)} />
                  </view>
                )
              }}
            </For>
          </view>
        </view>
        <view x={554} width={detailW() + 60} height={listView()} clipping>
          <view y={-detailY()} width={detailW() + 60} height={Math.max(listView(), spot().height)}>
            <view y={33 + spot().faceY} width={240} height={240} borderRadius={120} color={spot().face.image ? look().os06 : spot().face.color}>
              <text fontFamily={boldFont} fontSize={86.4} x={120} mountX={0.5} y={75} color="#ffffff">
                {spot().face.initials}
              </text>
              <Show when={spot().face.image}>
                <view width={240} height={240} borderRadius={120} src={spot().face.image} textureOptions={COVER} />
              </Show>
            </view>
            <view x={282} y={33 + spot().infoY}>
              <text fontFamily={boldFont} fontSize={18} letterSpacing={1} y={7} color={look().accent}>
                {eyebrow}
              </text>
              <text
                fontFamily={spot().nameFont}
                fontSize={52}
                lineHeight={54.6}
                letterSpacing={-1}
                y={spot().nameY + 2}
                maxWidth={detailW() - 282}
                maxLines={2}
                color={look().onSurface}
              >
                {spot().name}
              </text>
              <text fontFamily={textFont} fontSize={21} lineHeight={29.4} y={spot().bioY + 2} maxWidth={detailW() - 282} maxLines={2} color={look().os75}>
                {bio()}
              </text>
              <view y={spot().statsY}>
                <For each={stats.keys()}>
                  {(k) => {
                    const st = stats.item(k)
                    return (
                      <view x={st().x} width={st().w} height={90} borderRadius={16} color={look().os06}>
                        <text fontFamily={boldFont} fontSize={30} x={20} y={14} color={look().onSurface}>
                          {st().value}
                        </text>
                        <text fontFamily={textFont} fontSize={18} x={20} y={52} color={look().os65}>
                          {st().label}
                        </text>
                      </view>
                    )
                  }}
                </For>
              </view>
              <HeroButtons
                y={spot().buttonsY}
                buttons={spot().buttons}
                focus={zone() === 'main' && has() ? 0 : -1}
                look={look()}
                onPointerButton={() => pointMain(false)}
                onPointerButtonClick={() => pointMain(true)}
              />
            </view>
            <view>
              <For each={shelves.keys()}>
                {(k) => {
                  const sh = shelves.item(k)
                  return (
                    <view y={sh().y} width={detailW() + 60} height={57 + shelfHeight(sh().cards, PAD)}>
                      <text fontFamily={sh().titleFont} fontSize={28} y={26} color={look().onSurface}>
                        {sh().title}
                      </text>
                      <BookShelf
                        y={57}
                        cards={sh().cards}
                        focus={zone() === 'shelf' && has() && shelf() === sh().s ? col() : -1}
                        gap={24}
                        pad={PAD}
                        viewW={detailW() + 60}
                        look={look()}
                        zoom={props.zoom}
                        onPointerCard={(i, o) => pointCard(sh().s, i, o)}
                      />
                    </view>
                  )
                }}
              </For>
            </view>
          </view>
        </view>
      </view>
    </view>
  )
}
