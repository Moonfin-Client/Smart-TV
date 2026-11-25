import { For, createEffect, createMemo, createSelector, createSignal, on, onCleanup, untrack } from 'solid-js'
import GameGridCard from './GameGridCard.jsx'
import { pageGrid } from '../../../utils/gridChrome.js'

// A game system's grid, scrolled just far enough to keep the focused row in view. Only the rows
// near focus are built, a row at a time between frames. Props: `items`, `geo` (GameSystem's
// gridGeometry), `neon`, `x`, `ref`. Calls onGridFocus(card, i) and onGridSelect(card, i), and lets
// Up and the Left from the first column bubble. Its node has page(dir).
const AHEAD = 3
const BEHIND = 2

export default function GameGrid(props) {
  const [cur, setCur] = createSignal(0)
  const [built, setBuilt] = createSignal(0)
  const [scrollY, setScrollY] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(() => (focused() ? cur() : -1))
  const items = () => props.items || []
  const geo = () => props.geo
  const focusRow = () => Math.floor(cur() / geo().cols)
  const visible = createMemo(() => {
    const list = items()
    const cols = geo().cols
    const first = Math.max(0, Math.floor(scrollY() / geo().stride) - BEHIND) * cols
    const last = Math.min(list.length, built(), (focusRow() + AHEAD + 1) * cols)
    return list.slice(first, last)
  })
  const trackH = () => Math.max(geo().viewH, Math.ceil(items().length / geo().cols) * geo().stride)

  let growTimer = null
  onCleanup(() => clearTimeout(growTimer))
  const grow = () => {
    const target = Math.min(items().length, (focusRow() + AHEAD + 1) * geo().cols)
    if (built() >= target || growTimer) return
    growTimer = setTimeout(
      () => {
        growTimer = null
        setBuilt(Math.min(target, built() + geo().cols))
        grow()
      },
      built() === 0 ? 0 : 60,
    )
  }
  createEffect(
    on(
      () => props.items,
      () => {
        clearTimeout(growTimer)
        growTimer = null
        setCur(0)
        setScrollY(0)
        setBuilt(0)
        untrack(grow)
      },
    ),
  )

  const notify = () => {
    const card = items()[cur()]
    if (card && props.onGridFocus) props.onGridFocus(card, cur())
  }
  // Scrolls only as far as it takes to show the focused row whole.
  const reveal = () => {
    const { stride, viewH } = geo()
    const top = focusRow() * stride
    if (top < scrollY()) setScrollY(top)
    else if (top + stride > scrollY() + viewH) setScrollY(top + stride - viewH)
  }
  const moveTo = (next) => {
    if (next < 0 || next >= items().length) return false
    setCur(next)
    reveal()
    notify()
    grow()
    return true
  }

  // The Magic Remote's cursor (app/pointer.js): a game in full view takes focus on hover, one the grid
  // would scroll to on a click. onPointerGrid() gives the grid focus first.
  const pointAt = (i, click) => {
    const { stride, viewH } = geo()
    const top = Math.floor(i / geo().cols) * stride
    const whole = top >= scrollY() && top + stride <= scrollY() + viewH
    if (!click && (!whole || (focused() && cur() === i))) return false
    if (!focused() && props.onPointerGrid) props.onPointerGrid()
    if (cur() !== i) moveTo(i)
    return click
  }
  const attach = (n) => {
    n.page = (direction) => {
      const g = geo()
      const turn = pageGrid({
        from: cur(),
        direction,
        count: items().length,
        columns: g.cols,
        stride: g.stride,
        cardTop: g.padY,
        cardHeight: g.cardH,
        scrollTop: scrollY(),
        viewport: g.viewH,
      })
      if (!turn) return
      setScrollY(turn.scrollTop)
      setCur(turn.target)
      notify()
      grow()
    }
    if (props.ref) props.ref(n)
  }

  return (
    <view
      ref={attach}
      x={props.x || 0}
      width={1780}
      height={geo().viewH}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) notify()
      }}
      onLeft={() => cur() % geo().cols !== 0 && moveTo(cur() - 1)}
      onRight={() => {
        if (cur() % geo().cols !== geo().cols - 1) moveTo(cur() + 1)
        return true
      }}
      // Up leaves for the toolbar while the grid is scrolled less than 50px, from any row, and moves
      // up a row once it's scrolled further.
      onUp={() => scrollY() >= 50 && moveTo(cur() - geo().cols)}
      onDown={() => {
        const total = items().length
        if (!moveTo(cur() + geo().cols) && focusRow() < Math.floor((total - 1) / geo().cols)) moveTo(total - 1)
        return true
      }}
      onEnter={() => {
        const card = items()[cur()]
        if (card && props.onGridSelect) props.onGridSelect(card, cur())
        return true
      }}
    >
      <view width={1780} height={trackH()} y={-scrollY()} transition={{ y: { duration: 250, easing: 'ease-out' } }}>
        <For each={visible()}>
          {(card) => (
            <GameGridCard
              x={(card.idx % geo().cols) * geo().cellW + geo().padX}
              y={Math.floor(card.idx / geo().cols) * geo().stride + geo().padY}
              card={card}
              w={geo().coverW}
              coverH={geo().coverH}
              neon={props.neon}
              focused={isCur(card.idx)}
              onPointerOver={() => pointAt(card.idx, false)}
              onPointerClick={() => pointAt(card.idx, true)}
            />
          )}
        </For>
      </view>
    </view>
  )
}
