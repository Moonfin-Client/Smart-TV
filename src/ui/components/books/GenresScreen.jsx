import $L from '../../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSelector, createSignal, on } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { menuHold } from '../modals/menuHold.js'
import { focusScroll } from '../nav/focusScroll.js'
import { api } from '../../../services/jellyfinApi.js'
import { combinedTypes } from '../../../utils/bookLibrary.js'
import BookShelf from './BookShelf.jsx'
import { ScreenTitle, TabBar } from './BookControls.jsx'
import { bookCard } from './bookCards.js'
import { countLabel } from './bookGrid.js'
import { bookPointer, shelfHeight, showsWhole } from './bookParts.js'
import { ellipsize, tabBarWidth, textWidth } from './bookText.js'
import { BOOK_FIELDS } from './bookLibraryData.js'
import { STATION_COLORS, bookMenuItem, genreTitleCount, sortBookGenres, titlesCount } from './bookScreens.js'

const SHELF_SIZE = 12
const CARD_W = 150
const ROW_H = 310
const STRIDE = 340
const PAD = [6, 60, 6, 33]
const CLEAR = '#00000000'
const PLACEHOLDERS = [0, 1, 2, 3, 4, 5, 6].map((i) => 33 + i * 174)

// Shelves load once their rows come into view. The host gets onScreenLeft(), onScreenUp() and
// openItem(item), and the node has land().
export default function GenresScreen(props) {
  const [order, setOrder] = createSignal('most')
  const [shelves, setShelves] = createSignal({})
  const [row, setRow] = createSignal(0)
  const [col, setCol] = createSignal(-1)
  const [header, setHeader] = createSignal(false)
  const [hcur, setHcur] = createSignal(0)
  const [scrollY, setScrollY] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const asked = {}
  let left = {}
  const orders = [
    { id: 'most', label: $L('Most Titles') },
    { id: 'name', label: $L('A to Z') },
  ]
  const chipLabel = $L('Surprise Me')
  const boldFont = uiFont('bold')
  const textFont = uiFont()
  const look = () => props.look
  const cw = () => 1920 - (props.railW || 0)
  const counted = createMemo(() => props.data.genres.some((g) => genreTitleCount(g) > 0))
  const sorted = createMemo(() => sortBookGenres(props.data.genres, counted() ? order() : 'name'))
  const count = () => (sorted().length ? countLabel(sorted().length, $L('1 genre'), $L('{count} genres')) : '')
  const headerH = () => (counted() ? 81 : 73.2)
  // The station names, measured once per sort rather than again as each shelf loads.
  const names = createMemo(() =>
    sorted().map((genre) => ({ name: ellipsize(genre.Name || '', 36, 'bold', 291), nameFont: fontFor(genre.Name || '', 'bold') })),
  )
  const rows = createMemo(() =>
    sorted().map((genre, r) => {
      const shelf = shelves()[genre.Id]
      const n = genreTitleCount(genre) || (shelf && shelf.total) || 0
      return {
        k: genre.Id,
        r,
        y: 30 + r * STRIDE,
        color: STATION_COLORS[r % STATION_COLORS.length],
        name: names()[r].name,
        nameFont: names()[r].nameFont,
        meta: n > 0 ? titlesCount(n) : '',
        cards: shelf ? shelf.cards : [],
        shelfY: shelf ? ROW_H - shelfHeight(shelf.cards, PAD) : 0,
        loading: !shelf,
      }
    }),
  )
  const height = () => 30 + sorted().length * STRIDE + 60
  const chipW = Math.ceil(textWidth(chipLabel, 21, 'bold')) + 36 + 39
  const view = () => props.viewH - headerH()
  // Only the rows near the screen are built.
  const near = createMemo(() => rows().filter((r) => r.y + ROW_H > scrollY() - 700 && r.y < scrollY() + view() + 700))
  const list = keyed(near, (r) => r.k)
  const isRow = createSelector(() => (!header() && has() ? row() : null))

  const loadShelf = (genre) => {
    if (asked[genre.Id]) return
    asked[genre.Id] = true
    api
      .getItems({
        ParentId: props.library.Id,
        IncludeItemTypes: combinedTypes(props.library),
        GenreIds: genre.Id,
        Recursive: true,
        SortBy: 'DateCreated,SortName',
        SortOrder: 'Descending',
        Fields: BOOK_FIELDS,
        ImageTypeLimit: 1,
        Limit: SHELF_SIZE,
      })
      .then(
        (res) => ({ items: (res && res.Items) || [], total: (res && res.TotalRecordCount) || 0 }),
        () => ({ items: [], total: 0 }),
      )
      .then((shelf) => {
        const cards = shelf.items.map((book, i) => bookCard(book, i, CARD_W))
        setShelves({ ...shelves(), [genre.Id]: { cards, total: shelf.total } })
      })
  }
  const loadVisible = () => {
    const first = Math.max(0, Math.floor(scrollY() / STRIDE) - 1)
    const last = Math.ceil((scrollY() + view()) / STRIDE) + 1
    sorted()
      .slice(first, last)
      .forEach((g) => loadShelf(g))
  }
  createEffect(on(sorted, loadVisible))
  const reveal = () => {
    const gr = rows()[row()]
    if (!gr) return
    const top = gr.y + (col() < 0 ? 70 : 0)
    const bottom = gr.y + ROW_H
    setScrollY(focusScroll(top, bottom - top, scrollY(), view(), Math.max(0, height() - view())))
    loadVisible()
  }
  const land = () => {
    batch(() => {
      setHeader(false)
      setRow(0)
      setCol(-1)
    })
    reveal()
  }
  const surprise = async (genre) => {
    const pick = (filters) =>
      api
        .getItems({
          ParentId: props.library.Id,
          IncludeItemTypes: combinedTypes(props.library),
          GenreIds: genre.Id,
          Recursive: true,
          SortBy: 'Random',
          Limit: 1,
          Fields: BOOK_FIELDS,
          ...filters,
        })
        .then(
          (res) => res && res.Items && res.Items[0],
          () => null,
        )
    const item = (await pick({ Filters: 'IsUnplayed' })) || (await pick({}))
    if (item) props.host.openItem(item)
  }
  const enter = () => {
    if (header()) {
      const id = orders[hcur()].id
      if (id !== order()) {
        batch(() => {
          setOrder(id)
          setScrollY(0)
        })
      }
      return
    }
    const gr = rows()[row()]
    if (!gr) return
    if (col() < 0) return surprise(sorted()[row()])
    const card = gr.cards[col()]
    if (card) props.host.openItem(card.raw)
  }
  // The Magic Remote's cursor (app/pointer.js): the order tabs take focus on hover, and a genre's
  // station or a book while in full view; one the page or its shelf would scroll to takes it on a
  // click.
  const point = bookPointer(props, has)
  const pointAt = (r, c, o) => {
    const gr = rows()[r]
    if (!gr || (c >= 0 && !gr.cards[c])) return false
    const top = gr.y + (c < 0 ? 70 : 0)
    const whole = o.whole && showsWhole(top, gr.y + ROW_H - top, scrollY(), view())
    return point(
      () => {
        setHeader(false)
        setRow(r)
        setCol(c)
        reveal()
      },
      { whole, lit: has() && !header() && row() === r && col() === c, click: o.click },
    )
  }
  const pointTab = (i) =>
    point(
      () => {
        setHeader(true)
        setHcur(i)
      },
      { lit: has() && header() && hcur() === i },
    )
  const heldItem = () => {
    const gr = !header() && col() >= 0 ? rows()[row()] : null
    return gr && gr.cards[col()] ? bookMenuItem(gr.cards[col()].raw) : null
  }
  const hold = menuHold(heldItem, enter)
  return (
    <view
      ref={(n) => {
        n.land = land
        n.landControls = () => {
          if (!counted()) return false
          batch(() => {
            setHeader(true)
            setHcur(Math.max(0, orders.findIndex((o) => o.id === order())))
          })
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
      onUp={() => {
        if (header()) {
          props.host.onScreenUp()
          return true
        }
        if (row() > 0) {
          batch(() => {
            setRow(row() - 1)
            // Coming back to a row lands on the title it was left on, or the station first.
            setCol(left[row()] != null ? left[row()] : -1)
          })
          reveal()
        } else if (counted()) {
          batch(() => {
            setHeader(true)
            setHcur(Math.max(0, orders.findIndex((o) => o.id === order())))
          })
        } else props.host.onScreenUp()
        return true
      }}
      onDown={() => {
        if (header()) {
          batch(() => {
            setHeader(false)
            setRow(0)
            setCol(-1)
          })
          reveal()
        } else if (row() < rows().length - 1) {
          left = { ...left, [row()]: col() }
          batch(() => {
            setRow(row() + 1)
            setCol(left[row()] != null ? left[row()] : -1)
          })
          reveal()
        }
        return true
      }}
      onLeft={() => {
        if (header()) {
          if (hcur() > 0) setHcur(hcur() - 1)
          else props.host.onScreenLeft()
        } else if (col() >= 0) setCol(col() - 1)
        else props.host.onScreenLeft()
        return true
      }}
      onRight={() => {
        if (header()) {
          if (hcur() < orders.length - 1) setHcur(hcur() + 1)
        } else {
          const gr = rows()[row()]
          if (gr && col() < gr.cards.length - 1) setCol(col() + 1)
        }
        return true
      }}
      onEnter={() => {
        enter()
        return true
      }}
    >
      <ScreenTitle
        title={$L('Genres')}
        count={count()}
        rowH={counted() ? 63 : 55.2}
        controlsX={counted() ? cw() - 60 - tabBarWidth(orders, order()) : null}
        look={look()}
      />
      <TabBar
        x={cw() - 60 - tabBarWidth(orders, order())}
        y={18}
        alpha={counted() ? 1 : 0}
        tabs={orders}
        active={order()}
        focus={header() && has() ? hcur() : -1}
        look={look()}
        onPointerTab={(i) => counted() && pointTab(i)}
      />
      <view y={headerH()} width={cw()} height={view()} clipping>
        <view y={-scrollY()} width={cw()} height={Math.max(props.viewH, height())}>
          <For each={list.keys()}>
            {(k) => {
              const gr = list.item(k)
              const here = () => isRow(gr().r)
              return (
                <view x={60} y={gr().y} width={cw() - 60} height={ROW_H}>
                  <view
                    y={70}
                    width={345}
                    height={240}
                    onPointerOver={() => pointAt(gr().r, -1, { whole: true, click: false })}
                    onPointerClick={() => pointAt(gr().r, -1, { whole: true, click: true })}
                  >
                    <view width={345} height={240} borderRadius={24} color={gr().color} />
                    <view x={-3} y={-3} width={351} height={246} borderRadius={27} color={CLEAR} border={{ width: 3, color: hex(look().focus) }} alpha={here() && col() < 0 ? 1 : 0} />
                    <text fontFamily={gr().nameFont} fontSize={36} x={27} y={25} color="#ffffff">
                      {gr().name}
                    </text>
                    <text fontFamily={textFont} fontSize={21} x={27} y={74} color="#ffffff" alpha={0.85}>
                      {gr().meta}
                    </text>
                    <view x={27} y={162} width={chipW} height={54} borderRadius={27} color="#0000004d">
                      <view x={15} y={12} width={30} height={30} src="icons/book_casino_rounded.webp" />
                      <text fontFamily={boldFont} fontSize={21} x={54} y={15} color="#ffffff">
                        {chipLabel}
                      </text>
                    </view>
                  </view>
                  <view x={345} width={cw() - 60 - 345} height={ROW_H}>
                    <view alpha={gr().loading ? 1 : 0}>
                      <For each={PLACEHOLDERS}>{(x) => <view x={x} y={79} width={150} height={225} borderRadius={12} color={look().os06} />}</For>
                    </view>
                    <BookShelf
                      y={gr().shelfY}
                      cards={gr().cards}
                      focus={here() ? col() : -1}
                      gap={24}
                      pad={PAD}
                      viewW={cw() - 60 - 345}
                      look={look()}
                      zoom={props.zoom}
                      onPointerCard={(i, o) => pointAt(gr().r, i, o)}
                    />
                  </view>
                </view>
              )
            }}
          </For>
          <Show when={!sorted().length}>
            <text fontFamily={textFont} fontSize={20} x={cw() / 2} y={54} mountX={0.5} color={look().os50}>
              {$L('No items found')}
            </text>
          </Show>
        </view>
      </view>
    </view>
  )
}
