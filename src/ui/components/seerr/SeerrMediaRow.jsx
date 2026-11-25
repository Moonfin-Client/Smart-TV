import { For, createEffect, createMemo, createSelector, createSignal, on, onCleanup, untrack } from 'solid-js'
import SeerrPosterCard from './SeerrPosterCard.jsx'
import RatingsRow from '../home/RatingsRow.jsx'
import { artLoaded, noteArt, warmArt } from '../home/cards.js'
import { lineCount } from '../games/wrap.js'
import { uiFont, cssShift, textWidth } from '../../text.js'
import { tx } from '../../fx.js'
import { pointerFocus } from '../../../app/pointer.js'

// A Modern title row on Seerr Discover: the title at the screen's inset, posters 28px apart, and
// the focused one parked at the leading edge and grown to its wide art with the ratings and
// overview under it. The row owns Left, Right and Enter, and tells the page onRowFocus(rowIndex,
// card), onRowSelect(rowIndex, card), onRowMore(rowIndex) near its end and onRowGrow(rowIndex,
// extra) as an open card's text pushes the rows under it down. Its node has focusIndex(i), and
// `startIndex` is where focus starts.
// row: { key, title, cards: [{ ...SeerrPosterCard model, x, wide, overview, overviewFont, raw }] }
// look: { inset, titleSize, itemsBottom, openMs, focus, leftNav, posterW, posterH, openW, mdb }
const GAP = 28
const ART_WAIT_MS = 300
const WARM_REACH = 2
// Cards this far either side of focus are off screen, so they aren't built.
const BEHIND = 3
const AHEAD = 9
// Room under the art for three caption lines, which every row keeps, the same as Home's
// MODERN_CAPTION_ROOM.
const CAPTION_ROOM = 89
// The scroller's right padding.
const PAD_RIGHT = 33
const OPEN_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'

export const CORE_GAP = GAP

export default function SeerrMediaRow(props) {
  const [cur, setCur] = createSignal(props.startIndex || 0)
  const [on_, setOn] = createSignal(false)
  const [open, setOpen] = createSignal(false)
  const [ratingsH, setRatingsH] = createSignal(0)
  const titleFont = uiFont('bold')
  let wait = null
  onCleanup(() => clearTimeout(wait))

  const L = () => props.look
  const cards = () => (props.row && props.row.cards) || []
  const card = () => cards()[cur()]
  const focusAt = () => (on_() ? cur() : -1)
  const openAt = () => (on_() && open() ? cur() : -1)
  const isFocused = createSelector(focusAt)
  const isOpen = createSelector(openAt)
  const extra = () => (openAt() >= 0 ? L().openW - L().posterW : 0)
  const shown = createMemo(() => cards().slice(Math.max(0, cur() - BEHIND), cur() + AHEAD))
  const pad = () => L().inset + 6
  const laneW = () => {
    const last = cards()[cards().length - 1]
    return last ? last.x + L().posterW + extra() : 0
  }
  const scroll = () => {
    const c = card()
    if (!c) return 0
    return Math.max(0, Math.min(c.x, pad() + laneW() + PAD_RIGHT - 1920))
  }
  // The grown card's text reaches to the scroller's right padding.
  const detailsW = () => {
    const c = card()
    if (!c) return 0
    return Math.max(L().openW, 1920 - PAD_RIGHT - (pad() + c.x - scroll()))
  }
  const overview = () => (openAt() >= 0 && card() ? card().overview || '' : '')
  const ratingsItem = createMemo(() => (openAt() >= 0 && card() ? card().raw : null))
  const textTop = () => L().posterH + 10 + 29 + 27 + 7
  // Where the overview's line box starts under the text's top: 7px down, or 3px under the ratings,
  // whose box draws 4px shorter than the row reports.
  const overviewTop = () => (ratingsH() ? ratingsH() - 1 : 7)
  // How far the open card's text runs past the caption room every row keeps.
  const grow = createMemo(() => {
    if (openAt() < 0) return 0
    const lines = Math.min(3, lineCount(overview(), 20, 'regular', detailsW(), textWidth))
    return Math.max(0, textTop() + overviewTop() + lines * 28 - (L().posterH + CAPTION_ROOM))
  })
  const laneH = () => 10 + L().posterH + CAPTION_ROOM + L().itemsBottom
  createEffect(on(grow, (h) => props.onRowGrow && props.onRowGrow(props.rowIndex, h), { defer: true }))
  createEffect(on(ratingsItem, (it) => !it && setRatingsH(0), { defer: true }))
  const glide = () => (L().openMs ? { duration: L().openMs, easing: OPEN_EASE } : undefined)

  // The focused card grows once its wide art is in, or after a short wait.
  const settle = () => {
    const c = card()
    clearTimeout(wait)
    setOpen(false)
    if (!c) return
    if (c.wide && !artLoaded(c.wide)) {
      warmArt(c.wide)
      wait = setTimeout(() => {
        noteArt(c.wide)
        setOpen(true)
      }, ART_WAIT_MS)
    } else setOpen(true)
    const list = cards()
    for (let i = Math.max(0, cur() - WARM_REACH); i <= Math.min(list.length - 1, cur() + WARM_REACH); i++) {
      if (i !== cur() && list[i].wide) warmArt(list[i].wide)
    }
    if (props.onRowFocus) props.onRowFocus(props.rowIndex, c)
    // A row that pages asks for more once focus is among its last few cards.
    if (cur() >= list.length - 3 && props.onRowMore) props.onRowMore(props.rowIndex)
  }
  // The Magic Remote's cursor rings a card, and a click focuses it and opens it (app/pointer.js). The
  // row slides to its focused card, so hover doesn't move focus.
  let self
  const pick = (c) => {
    if (!c) return false
    pointerFocus(self)
    if (props.onPointerRow) props.onPointerRow()
    if (c.idx !== cur()) move(c.idx)
    return true
  }
  const move = (to) => {
    if (to === cur() || to < 0 || to >= cards().length) return
    setCur(to)
    settle()
  }
  const spanW = () => pad() + laneW() + 1920
  const spanH = () => laneH() + grow()

  return (
    <view
      ref={(n) => {
        self = n
        n.focusIndex = (i) => setCur(Math.max(0, Math.min(i, cards().length - 1)))
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={1920}
      height={40 + laneH() + grow()}
      onFocusChanged={(has) => {
        setOn(has)
        if (has) return settle()
        setOpen(false)
        clearTimeout(wait)
      }}
      onLeft={() => {
        if (cur() > 0) move(cur() - 1)
        // With the sidebar, Left from the first card goes to it. With the top bar, it wraps to the last.
        else if (L().leftNav) return false
        else move(cards().length - 1)
        return true
      }}
      onRight={() => {
        move(cur() < cards().length - 1 ? cur() + 1 : 0)
        return true
      }}
      onEnter={() => {
        if (card() && props.onRowSelect) props.onRowSelect(props.rowIndex, card())
        return true
      }}
    >
      <text
        x={L().inset}
        y={6 + cssShift(L().titleSize)}
        fontFamily={titleFont}
        fontSize={L().titleSize}
        lineHeight={33}
        maxWidth={1700}
        maxLines={1}
        color="#ffffffff"
      >
        {(props.row && props.row.title) || ''}
      </text>
      <view y={40} width={1920} height={laneH() + grow()} clipping>
        <view transition={tx({ x: glide() })} x={pad() - scroll()} y={10} width={spanW()} height={spanH()}>
          <view width={spanW()} height={spanH()} pointerChildRing onPointerChildClick={(i) => pick(shown()[i])}>
            <For each={shown()}>
              {(c) => (
                <SeerrPosterCard
                  x={c.x + (openAt() >= 0 && c.idx > openAt() ? extra() : 0)}
                  card={c}
                  w={isOpen(c.idx) ? L().openW : L().posterW}
                  h={L().posterH}
                  art={isOpen(c.idx) ? c.wide : ''}
                  focused={isFocused(c.idx)}
                  ring={L().focus}
                  ringW={4}
                  openMs={L().openMs}
                />
              )}
            </For>
          </view>
          <view x={card() ? card().x : 0} y={textTop()} width={detailsW()} height={200} alpha={openAt() >= 0 ? 1 : 0}>
            <RatingsRow
              y={-6}
              item={ratingsItem()}
              compact
              singleLineWidth={detailsW()}
              maxW={detailsW()}
              pluginEnabled={L().mdb}
              onLayout={(b) => setRatingsH(b.empty || !untrack(ratingsItem) ? 0 : b.h)}
            />
            <text
              y={overviewTop() + cssShift(20)}
              fontFamily={(card() && card().overviewFont) || 'roboto'}
              fontSize={20}
              lineHeight={28}
              maxWidth={detailsW()}
              maxLines={3}
              color="#ffffffb3"
            >
              {overview()}
            </text>
          </view>
        </view>
      </view>
    </view>
  )
}
