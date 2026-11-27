import $L from '../../services/i18n.js'
import { For, Show, createMemo, createSelector, createSignal } from 'solid-js'
import SeerrTile from '../../ui/components/seerr/SeerrTile.jsx'
import SeerrPosterCard from '../../ui/components/seerr/SeerrPosterCard.jsx'
import { uiFont, cssShift } from '../../ui/text.js'
import { pointerFocus } from '../../app/pointer.js'

// A Discover tile row (shortcuts, genres, studios, networks) or, in the Classic style, a row of
// posters. The focused card parks at the leading edge and the row slides under it, focus wraps
// around the ends, and Left from the first card opens the sidebar.
// It owns Left, Right and Enter and tells the page onRowFocus(rowIndex, card), onRowSelect(rowIndex,
// card) and onRowMore(rowIndex) near its end. Its node has focusIndex(i), and `startIndex` is
// where focus starts.
// row: { key, title, kind: 'tile' | 'poster', cards (x placed), loading }
// look: { inset, sizes (discoverSizes), leftNav, focus, zoom }
const BEHIND = 3
const AHEAD = 9

export default function DiscoverRow(props) {
  const [cur, setCur] = createSignal(props.startIndex || 0)
  const [on, setOn] = createSignal(false)
  const titleFont = uiFont('bold')
  const loadingFont = uiFont()
  const loadingText = $L('Loading...')
  const L = () => props.look
  const row = () => props.row
  const cards = () => (row() && row().cards) || []
  const isFocused = createSelector(() => (on() ? cur() : -1))
  const shown = createMemo(() => cards().slice(Math.max(0, cur() - BEHIND), cur() + AHEAD))
  const tile = () => row().kind === 'tile'
  const cardW = () => (tile() ? L().sizes.tileWidth : L().sizes.posterWidth)
  // The scroll stops where the lane runs out.
  const scroll = () => {
    const c = cards()[cur()]
    const last = cards()[cards().length - 1]
    if (!c || !last) return 0
    const lane = L().inset + 6 + last.x + cardW() + (row().loading ? 140 : 0) + 33
    return Math.max(0, Math.min(c.x, lane - 1920))
  }
  const laneH = () => (tile() ? L().sizes.tileHeight + 17 : L().sizes.rowHeight)
  const itemsY = () => (tile() ? 8 : L().sizes.rowTop)
  const loadingX = () => {
    const last = cards()[cards().length - 1]
    return last ? last.x + L().sizes.posterWidth + 20 : 0
  }
  const spanW = () => {
    const last = cards()[cards().length - 1]
    return (last ? last.x + cardW() : 0) + 1920
  }

  const report = () => {
    const c = cards()[cur()]
    if (c && props.onRowFocus) props.onRowFocus(props.rowIndex, c)
    if (cur() >= cards().length - 3 && props.onRowMore) props.onRowMore(props.rowIndex)
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
    report()
  }

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
      height={49 + laneH()}
      onFocusChanged={(has) => {
        setOn(has)
        if (has) report()
      }}
      onLeft={() => {
        if (cur() > 0) move(cur() - 1)
        else if (L().leftNav) return false
        else move(cards().length - 1)
        return true
      }}
      onRight={() => {
        move(cur() < cards().length - 1 ? cur() + 1 : 0)
        return true
      }}
      onEnter={() => {
        const c = cards()[cur()]
        if (c && props.onRowSelect) props.onRowSelect(props.rowIndex, c)
        return true
      }}
    >
      <text x={L().inset} y={cssShift(28)} fontFamily={titleFont} fontSize={28} lineHeight={33} maxWidth={1700} maxLines={1} color="#ffffffff">
        {row().title || ''}
      </text>
      <view y={49} width={1920} height={laneH()} clipping>
        <view x={L().inset + 6 - scroll()} y={itemsY()} width={spanW()} height={laneH()}>
          <view width={spanW()} height={laneH()} pointerChildRing onPointerChildClick={(i) => pick(shown()[i])}>
            <Show when={tile()}>
              <For each={shown()}>
                {(t) => <SeerrTile x={t.x} tile={t} w={L().sizes.tileWidth} h={L().sizes.tileHeight} focused={isFocused(t.idx)} ring={L().focus} />}
              </For>
            </Show>
          </view>
          <view width={spanW()} height={laneH()} pointerChildRing onPointerChildClick={(i) => pick(shown()[i])}>
            <Show when={!tile()}>
              <For each={shown()}>
                {(c) => (
                  <SeerrPosterCard
                    x={c.x}
                    card={c}
                    w={L().sizes.posterWidth}
                    h={L().sizes.posterHeight}
                    focused={isFocused(c.idx)}
                    zoom={L().zoom}
                    ring={L().focus}
                  />
                )}
              </For>
            </Show>
          </view>
          <view>
            <Show when={row().loading}>
              <view x={loadingX()} width={120} height={150}>
                <text x={60} y={75} mountX={0.5} mountY={0.5} fontFamily={loadingFont} fontSize={18} color="#ffffff99">
                  {loadingText}
                </text>
              </view>
            </Show>
          </view>
        </view>
      </view>
    </view>
  )
}
