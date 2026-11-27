import $L from '../../../services/i18n.js'
import { For, Show, batch, createMemo, createSignal, mapArray } from 'solid-js'
import { fontFor, uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { menuHold } from '../modals/menuHold.js'
import { focusScroll } from '../nav/focusScroll.js'
import { bookProgressMeta } from '../../../utils/bookLibrary.js'
import BookShelf from './BookShelf.jsx'
import { ScreenTitle } from './BookControls.jsx'
import { bookCard } from './bookCards.js'
import { countLabel } from './bookGrid.js'
import { bookPointer, shelfHeight, showsWhole } from './bookParts.js'
import { ellipsize, lineCount } from './bookText.js'
import { authorOf, bookMenuItem, isFinished, readingOrder, seriesProgress } from './bookScreens.js'

const CARD_W = 180
const PAD = [12, 60, 12, 6]
const HEADER_H = 73.2
const INFO_W = 306
const FIRST_ROWS = 10
const ROWS_AHEAD = 6

// Rows are built as focus nears them. The host gets onScreenLeft(), onScreenUp() and
// openItem(item), and the node has land().
export default function SeriesScreen(props) {
  const [row, setRow] = createSignal(0)
  const [col, setCol] = createSignal(0)
  const [reach, setReach] = createSignal(FIRST_ROWS)
  const [scrollY, setScrollY] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const eyebrow = $L('Series').toUpperCase()
  const eyebrowFont = uiFont('bold')
  const textFont = uiFont()
  const look = () => props.look
  const cw = () => 1920 - (props.railW || 0)
  const count = () => {
    const n = props.data.series.length
    return n ? countLabel(n, $L('1 series'), $L('{count} series')) : ''
  }
  // Each series' cards and text, worked out once, so reaching further down only builds the new rows.
  const built = createMemo(
    mapArray(
      () => props.data.series.slice(0, reach()),
      (series) =>
        createMemo(() => {
          const books = readingOrder(series.Members || [])
          const progress = seriesProgress(books)
          const author = authorOf(books[0])
          const cards = books.map((book, i) =>
            bookCard(book, i, CARD_W, {
              number: book.IndexNumber != null ? book.IndexNumber : i + 1,
              upNext: book === progress.next,
              finished: isFinished(book),
              subtitle: isFinished(book) ? $L('Finished') : bookProgressMeta(book),
            }),
          )
          const nameLines = Math.max(1, lineCount(series.Name || '', 34, 'bold', INFO_W, 2))
          const infoH = 33 + 6 + 39.1 * nameLines + (author ? 39 : 0) + 39
          const sh = shelfHeight(cards, PAD)
          const h = Math.max(infoH, sh)
          return {
            k: series.Id,
            h,
            cards,
            shelfY: (h - sh) / 2,
            infoY: (h - infoH) / 2,
            name: series.Name || '',
            nameFont: fontFor(series.Name || '', 'bold'),
            author: ellipsize(author, 21, 'regular', INFO_W),
            authorFont: fontFor(author),
            authorY: 33 + 6 + 39.1 * nameLines + 6,
            label: ellipsize(progress.label, 19, 'regular', INFO_W),
            labelY: 33 + 6 + 39.1 * nameLines + (author ? 39 : 0) + 6,
          }
        }),
    ),
  )
  const rows = createMemo(() => {
    const shelfW = cw() - 60 - 330
    let y = 24
    return built().map((one, r) => {
      const out = { ...one(), r, y, shelfW }
      y += out.h + 36
      return out
    })
  })
  // Only the rows near the screen are built.
  const near = createMemo(() => rows().filter((r) => r.y + r.h > scrollY() - 700 && r.y < scrollY() + props.viewH + 700))
  const list = keyed(near, (r) => r.k)
  const height = () => {
    const last = rows()[rows().length - 1]
    return last ? last.y + last.h + 36 + 60 : 0
  }
  const reveal = () => {
    setReach(Math.max(reach(), row() + ROWS_AHEAD))
    const sr = rows()[row()]
    const card = sr && sr.cards[col()]
    if (!card) return
    const top = sr.y + sr.shelfY + 12 + (shelfHeight(sr.cards, PAD) - 24 - (card.h + 78))
    const view = props.viewH - HEADER_H
    setScrollY(focusScroll(top, card.h + 78, scrollY(), view, Math.max(0, height() - view)))
  }
  const land = () => {
    batch(() => {
      setRow(0)
      setCol(0)
    })
    reveal()
  }
  // Up and down land on the nearest book in the next row.
  const moveRow = (step) => {
    const next = rows()[row() + step]
    if (!next) return false
    const from = col() * (CARD_W + 24)
    let best = 0
    next.cards.forEach((c, i) => {
      if (Math.abs(i * (CARD_W + 24) - from) < Math.abs(best * (CARD_W + 24) - from)) best = i
    })
    batch(() => {
      setRow(row() + step)
      setCol(best)
    })
    reveal()
    return true
  }
  // The Magic Remote's cursor (app/pointer.js): a book in full view takes focus on hover, one the page
  // or its shelf would scroll to on a click.
  const point = bookPointer(props, has)
  const pointCard = (r, i, o) => {
    const sr = rows()[r]
    const card = sr && sr.cards[i]
    if (!card) return false
    const top = sr.y + sr.shelfY + 12 + (shelfHeight(sr.cards, PAD) - 24 - (card.h + 78))
    const whole = o.whole && showsWhole(top, card.h + 78, scrollY(), props.viewH - HEADER_H)
    return point(
      () => {
        batch(() => {
          setRow(r)
          setCol(i)
        })
        reveal()
      },
      { whole, lit: has() && row() === r && col() === i, click: o.click },
    )
  }
  const focusedCard = () => {
    const sr = rows()[row()]
    return sr && sr.cards[col()]
  }
  const enter = () => {
    const card = focusedCard()
    if (card) props.host.openItem(card.raw)
  }
  const hold = menuHold(() => bookMenuItem((focusedCard() || {}).raw), enter)
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
      onUp={() => {
        if (!moveRow(-1)) props.host.onScreenUp()
        return true
      }}
      onDown={() => {
        moveRow(1)
        return true
      }}
      onLeft={() => {
        if (col() > 0) {
          setCol(col() - 1)
          reveal()
        } else props.host.onScreenLeft()
        return true
      }}
      onRight={() => {
        const sr = rows()[row()]
        if (sr && col() < sr.cards.length - 1) {
          setCol(col() + 1)
          reveal()
        }
        return true
      }}
      onEnter={() => {
        enter()
        return true
      }}
    >
      <ScreenTitle title={$L('Series')} count={count()} look={look()} />
      <view y={HEADER_H} width={cw()} height={props.viewH - HEADER_H} clipping>
        <view y={-scrollY()} width={cw()} height={Math.max(props.viewH, height())}>
          <For each={list.keys()}>
            {(k) => {
              const sr = list.item(k)
              return (
                <view x={60} y={sr().y} width={cw() - 60} height={sr().h}>
                  <view y={sr().infoY}>
                    <text fontFamily={eyebrowFont} fontSize={18} letterSpacing={1} y={7} color={look().accent}>
                      {eyebrow}
                    </text>
                    <text fontFamily={sr().nameFont} fontSize={34} lineHeight={39.1} y={41} maxWidth={306} maxLines={2} color={look().onSurface}>
                      {sr().name}
                    </text>
                    <text fontFamily={sr().authorFont} fontSize={21} y={sr().authorY + 5} color={look().os75}>
                      {sr().author}
                    </text>
                    <text fontFamily={textFont} fontSize={19} y={sr().labelY + 6} color={look().os65}>
                      {sr().label}
                    </text>
                  </view>
                  <BookShelf
                    x={330}
                    y={sr().shelfY}
                    cards={sr().cards}
                    focus={has() && row() === sr().r ? col() : -1}
                    gap={24}
                    pad={PAD}
                    viewW={sr().shelfW}
                    look={look()}
                    zoom={props.zoom}
                    onPointerCard={(i, o) => pointCard(sr().r, i, o)}
                  />
                </view>
              )
            }}
          </For>
          <Show when={!props.data.series.length}>
            <text fontFamily={textFont} fontSize={20} x={cw() / 2} y={54} mountX={0.5} color={look().os50}>
              {$L('No items found')}
            </text>
          </Show>
        </view>
      </view>
    </view>
  )
}
