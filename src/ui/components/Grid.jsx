import { For, createEffect, createMemo, createSelector, createSignal, on, onCleanup } from 'solid-js'
import { Dynamic } from '@solidtv/solid'
import Card from './Card.jsx'
import { CARD_SIZES } from '../models.js'
import { moveIndex, scrollRowFor } from './library/tileGridMath.js'
import { edgeOffset, windowOf } from './gridWindow.js'
import { tx } from '../fx.js'
import { pointerFocus } from '../../app/pointer.js'

// A grid for long lists. Only the lines around the visible ones exist, and in tile mode their tiles
// are keyed by slot, so scrolling a line re-fills the tiles that left rather than building new ones.
// It calls onGridFocus(card, index), onGridSelect(card, index) and onGridEnd() on the holder, the
// last when focus nears the end so it can load another page.
// With `tile` (a component) the holder lays the grid out: `cols` columns (rows when `horizontal`)
// of `tileW` by `tileH` cells in `viewH` (or `viewW`) of room, with `opts` handed to every tile.
// Without it, card mode draws Card.jsx sized from CARD_SIZES[type], `columns` across under `top`.
// A tile grid scrolls by whole lines. With `gap` set, a card past the far edge comes in until it
// sits the 24px scroll affordance short of it (none for a horizontal grid), and `gap` is the part
// of each step that isn't the card. `held` draws the first card focused while the grid isn't.
const BEHIND = 1
const AFFORDANCE = 24

export default function Grid(props) {
  const [cur, setCur] = createSignal(0)
  const [first, setFirst] = createSignal(0)
  const [built, setBuilt] = createSignal(0)
  const [px, setPx] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(cur)
  const items = () => props.items || []
  const tile = () => !!props.tile
  const size = () => CARD_SIZES[props.type || 'poster']
  // Columns, or rows for a horizontal grid.
  const lanes = () => {
    if (tile()) return Math.max(1, props.cols || 1)
    return props.columns || Math.max(1, Math.floor((1920 - 192 + size().gap) / (size().w + size().gap)))
  }
  const stepX = () => (tile() ? props.tileW : size().w + size().gap)
  const stepY = () => (tile() ? props.tileH : size().h + 96)
  const step = () => (props.horizontal ? stepX() : stepY())
  const room = () => (props.horizontal ? props.viewW || 1920 : props.viewH || 1080)
  const fullLines = () => Math.max(1, Math.floor(room() / step()))
  const seenLines = () => Math.max(1, Math.ceil(room() / step()))
  const lines = () => Math.ceil(items().length / lanes())
  const edge = () => tile() && props.gap != null
  const offset = () => {
    if (edge()) return px()
    if (tile()) return first() * step()
    return Math.floor(cur() / lanes()) * stepY()
  }

  const win = createMemo(() => {
    const n = lanes()
    let from
    let to
    if (tile()) {
      from = Math.max(0, first() - BEHIND) * n
      to = (first() + seenLines() + 1) * n
    } else {
      const line = Math.floor(cur() / n)
      from = Math.max(0, line - BEHIND) * n
      to = Math.min(built(), (line + 3) * n)
    }
    const list = items()
    const out = {}
    const keys = []
    windowOf({ count: list.length, lanes: n, from, to, pool: n * (seenLines() + 2), tile: tile() }).forEach((w) => {
      const key = w.slot || list[w.i].key
      keys.push(key)
      out[key] = {
        i: w.i,
        x: props.horizontal ? w.line * stepX() : w.lane * stepX(),
        y: props.horizontal ? w.lane * stepY() : w.line * stepY(),
      }
    })
    return { keys, at: out }
  })

  // Card mode builds its lines a few at a time between frames.
  let growTimer = null
  const grow = () => {
    if (tile()) return
    const target = Math.min(items().length, (Math.floor(cur() / lanes()) + 3) * lanes())
    if (built() >= target || growTimer) return
    growTimer = setTimeout(
      () => {
        growTimer = null
        setBuilt(Math.min(target, built() + lanes()))
        grow()
      },
      built() === 0 ? 0 : 60,
    )
  }
  onCleanup(() => clearTimeout(growTimer))

  const current = () => items()[cur()]
  const notify = () => {
    const card = current()
    if (card && props.onGridFocus) props.onGridFocus(card, cur())
    const total = items().length
    const ahead = tile() ? 50 : lanes() * 3
    if (total && cur() >= total - ahead && props.onGridEnd) props.onGridEnd()
  }
  const moveTo = (next) => {
    if (next < 0 || next >= items().length) return false
    setCur(next)
    if (edge()) {
      const top = Math.floor(next / lanes()) * step()
      const affordance = props.horizontal ? 0 : AFFORDANCE
      setPx(edgeOffset({ px: px(), top, step: step(), gap: props.gap, room: room(), lines: lines(), affordance }))
      setFirst(Math.floor(px() / step()))
    } else if (tile()) {
      setFirst(scrollRowFor(Math.floor(next / lanes()), first(), fullLines()))
    } else {
      const from = Math.max(0, Math.floor(next / lanes()) - BEHIND) * lanes()
      if (built() < from) setBuilt(from)
      grow()
    }
    notify()
    return true
  }
  // A horizontal grid's lanes are rows, so its arrows turn a quarter.
  const TURN = { left: 'up', right: 'down', up: 'left', down: 'right' }
  const press = (dir) => {
    const next = moveIndex(cur(), props.horizontal ? TURN[dir] : dir, lanes(), items().length)
    return next === null ? false : moveTo(next)
  }

  createEffect(
    on(items, (list) => {
      const total = list.length
      if (cur() >= total) setCur(Math.max(0, total - 1))
      if (edge()) {
        setPx(Math.min(px(), Math.max(0, lines() * step() - props.gap - room())))
        setFirst(Math.floor(px() / step()))
      } else if (tile()) setFirst(Math.min(first(), Math.max(0, lines() - fullLines())))
      grow()
    }),
  )

  const slide = () => (props.slideMs == null ? 200 : props.slideMs)
  // The Magic Remote's cursor rings a tile, and a click focuses it and opens it (app/pointer.js). The
  // grid slides to its focused tile, so hover doesn't move focus.
  let self
  const pick = (i) => {
    pointerFocus(self)
    moveTo(i)
    return true
  }
  return (
    <view
      ref={(n) => {
        self = n
        n.focusIndex = (i) => moveTo(Math.max(0, Math.min(i, items().length - 1)))
        // Puts the grid back on its first item without telling the holder, for a new list.
        n.reset = () => {
          setCur(0)
          setFirst(0)
          setPx(0)
        }
        n.scrolled = () => (edge() ? px() > 0 : tile() ? first() > 0 : cur() >= lanes())
        n.current = current
        // The first line in view, which GenreBrowse reads pages around.
        n.first = () => first()
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) notify()
      }}
      onLeft={() => press('left')}
      onUp={() => press('up')}
      onRight={() => {
        if (tile()) return press('right')
        if (cur() % lanes() !== lanes() - 1) moveTo(cur() + 1)
        return true
      }}
      onDown={() => {
        if (tile()) return press('down')
        const total = items().length
        if (!moveTo(cur() + lanes()) && Math.floor(cur() / lanes()) < Math.floor((total - 1) / lanes())) moveTo(total - 1)
        return true
      }}
      onEnter={() => {
        const card = current()
        if (card && props.onGridSelect) props.onGridSelect(card, cur())
        return true
      }}
    >
      {/* Sized to all its lines: a view without a size takes its parent's at creation, and the
      renderer stops drawing it once it has scrolled that far out of view. */}
      <view
        x={props.horizontal ? -offset() : 0}
        y={props.horizontal ? 0 : (props.top || 0) - offset()}
        width={props.horizontal ? lines() * stepX() : lanes() * stepX()}
        height={props.horizontal ? lanes() * stepY() : lines() * stepY()}
        transition={tx({
          x: { duration: slide(), easing: 'ease-out' },
          y: { duration: tile() ? slide() : 260, easing: 'ease-out' },
        })}
      >
        <For each={win().keys}>
          {(key) => {
            let last = win().at[key]
            const at = () => (last = win().at[key] || last)
            return (
              <view x={at().x} y={at().y} width={size().w} height={size().h} pointerRing onPointerClick={() => pick(at().i)}>
                <Dynamic
                  component={props.tile || Card}
                  card={items()[at().i]}
                  w={size().w}
                  h={size().h}
                  opts={props.opts}
                  focused={(focused() && isCur(at().i)) || (!!props.held && at().i === 0)}
                />
              </view>
            )
          }}
        </For>
      </view>
    </view>
  )
}
