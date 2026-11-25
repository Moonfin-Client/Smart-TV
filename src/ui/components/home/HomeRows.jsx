import { For, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import { Dynamic } from '@solidtv/solid'
import MediaRow from './MediaRow.jsx'
import LibraryButtonRow from './LibraryButtonRow.jsx'
import WatchPartyRow from './WatchPartyRow.jsx'
import PlaceholderRow from './PlaceholderRow.jsx'
import TileRow from './TileRow.jsx'
import WatchingNowRow from './WatchingNowRow.jsx'
import { bandWindow } from './rowLayout.js'
import { onScreen } from './onScreen.js'

// Home's rows: the rows stacked in a band that clips at its top edge, with the focused row pinned
// to that edge and a glide between rows. Up and Down move between rows here. Up from the first row,
// and Left out of a row, go on to the page. The rows build a few at a time so a slow TV draws the
// first ones sooner, and only the rows near the band exist, each coming back on the card it was
// left on.
//
// Props: `rows` (shaped, each with its `box`), `look`, `band` ({ y, h, padTop, pin }, pin being how
// far below the band's top a focused row rests), `firstMargin`, `preview`, `alpha`, `ref`. It calls
// onRowFocus(card, rowKey, index, rowIndex), onRowSelect(card, rowKey, index), onRowSeeAll(row),
// onRowLoadMore(rowKey), onCardPreview(rowKey, card, rect) and onRowsNear(rowIndex). Its node has
// focusRow(i) and cur().

const FIRST_ROWS = 3
const ROW_MOUNT_GAP_MS = 50
// The scroller's room past the last row, 60 percent of the screen.
const TAIL = 648
// The placeholders breathe between 45 and 100 percent every 1.3 seconds, and hold still on the
// lowest tier.
const BREATHE_MS = 1300

const kindOf = (r) => {
  if (r.isPlaceholder) return PlaceholderRow
  if (r.isButtonRow) return LibraryButtonRow
  if (r.isWatchPartyRow) return WatchPartyRow
  if (r.isTileRow || r.isGameRow) return TileRow
  if (r.isWatchingNowRow) return WatchingNowRow
  return MediaRow
}

export default function HomeRows(props) {
  const [cur, setCur] = createSignal(0)
  const [mounted, setMounted] = createSignal(FIRST_ROWS)
  const [grown, setGrown] = createSignal({ key: '', h: 0 })
  const [dim, setDim] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  let root
  const nodes = {}
  // The card each row was left on, so a row built again comes back to it.
  const rowCur = {}
  let focusedKey = ''

  const rows = () => props.rows || []
  const placed = createMemo(() => {
    let y = props.band.padTop
    const g = grown()
    return rows().map((r, i) => {
      const at = y + (i === 0 ? props.firstMargin : 0)
      y = at + r.box.h + (r.key === g.key ? g.h : 0)
      return { row: r, key: r.key, i, y: at, box: r.box }
    })
  })
  const trackH = () => {
    const last = placed()[placed().length - 1]
    return last ? last.y + last.box.h : 0
  }
  const scrollY = createMemo(() => {
    const r = placed()[cur()]
    if (!r) return 0
    const max = Math.max(0, trackH() + TAIL - props.band.h)
    return Math.max(0, Math.min(r.y - props.band.pin, max))
  })
  // The rows near the band, by key, and each one's place.
  const byKey = createMemo(() => {
    const list = placed()
    const [from, to] = bandWindow(list, scrollY(), props.band.h, cur())
    const out = {}
    const keys = []
    for (let i = from; i < Math.min(to, list.length); i++) {
      if (i >= mounted() && !list[i].row.isPlaceholder) continue
      out[list[i].key] = list[i]
      keys.push(list[i].key)
    }
    return { keys, out }
  })
  const keys = createMemo(() => byKey().keys, undefined, { equals: (a, b) => a.join('\n') === b.join('\n') })
  const breathing = createMemo(() => rows().some((r) => r.isPlaceholder) && props.look.tier !== 'low')

  // Builds one more row every 50ms until all of them are in, while Home shows.
  let mountTimer = null
  const mountMore = () => {
    if (mountTimer || mounted() >= rows().length) return
    mountTimer = setTimeout(() => {
      mountTimer = null
      if (onScreen(root)) setMounted(Math.min(rows().length, mounted() + 1))
      mountMore()
    }, ROW_MOUNT_GAP_MS)
  }
  // Starts dim and rises, and only while placeholders show, so nothing changes on screen once the
  // rows are in.
  let breathTimer = null
  const breathe = () => {
    if (breathTimer) return
    const step = () => {
      breathTimer = null
      if (!untrack(breathing)) {
        setDim(false)
        return
      }
      setDim(onScreen(root) ? !dim() : false)
      breathTimer = setTimeout(step, BREATHE_MS)
    }
    setDim(true)
    breathTimer = setTimeout(step, 0)
  }
  createEffect(on(breathing, (on) => on && breathe()))
  onMount(mountMore)
  onCleanup(() => {
    clearTimeout(mountTimer)
    clearTimeout(breathTimer)
  })

  // The nearest row from `i` that has cards to focus, looking along `step` first, since a
  // placeholder holds a loading section's place but has nothing to focus.
  const focusableFrom = (i, step) => {
    const list = rows()
    for (let k = i; k >= 0 && k < list.length; k += step) if (!list[k].isPlaceholder) return k
    return -1
  }
  // Focus the row at `i`, building the rows up to it and a couple past it first.
  const focusRow = (i = cur()) => {
    const list = rows()
    if (!list.length) return
    i = Math.max(0, Math.min(i, list.length - 1))
    const at = focusableFrom(i, 1) >= 0 ? focusableFrom(i, 1) : focusableFrom(i, -1)
    if (at < 0) return
    if (mounted() < at + 3) setMounted(Math.min(list.length, at + 3))
    setCur(at)
    focusedKey = list[at].key
    const node = nodes[focusedKey]
    if (node && !node.destroyed) node.setFocus()
    else setTimeout(() => focusRow(), 0)
  }

  // A row landing above the focused one moves the rows under focus, so focus follows the row at its index.
  createEffect(
    on(
      rows,
      (list) => {
        if (cur() >= list.length) setCur(Math.max(0, list.length - 1))
        mountMore()
        const r = list[cur()]
        if (focused() && r && r.key !== focusedKey) focusRow(cur())
      },
      { defer: true },
    ),
  )

  const hand = {
    onRowFocus: (card, key, index) => props.onRowFocus && props.onRowFocus(card, key, index, cur()),
    onRowSelect: (card, key, index) => props.onRowSelect && props.onRowSelect(card, key, index),
    onRowSeeAll: (row) => props.onRowSeeAll && props.onRowSeeAll(row),
    onRowLoadMore: (key) => props.onRowLoadMore && props.onRowLoadMore(key),
    onRowCur: (key, index) => {
      rowCur[key] = index
    },
    // Only the row that grew can shrink itself back, so rows reporting no growth leave it be.
    onRowGrow: (key, h) => {
      if (h) setGrown({ key, h })
      else if (grown().key === key) setGrown({ key: '', h: 0 })
    },
    // A row's card art in screen pixels, read when the preview attaches.
    onCardPreview: (key, card, rect) => {
      if (!props.onCardPreview) return
      props.onCardPreview(
        key,
        card,
        card &&
          (() => {
            const r = rect()
            const row = byKey().out[key]
            return { x: r.x, y: props.band.y + (row ? row.y : 0) - scrollY() + r.y, w: r.w, h: r.h, r: r.r }
          }),
      )
    },
  }

  return (
    <view
      ref={(n) => {
        root = n
        n.focusRow = focusRow
        n.cur = cur
        n.focused = focused
        if (props.ref) props.ref(n)
      }}
      y={props.band.y}
      width={1920}
      height={props.band.h}
      alpha={props.alpha === undefined ? 1 : props.alpha}
      transition={{ alpha: { duration: 250 } }}
      clipping
      seasonalZone="rows"
      forwardFocus={() => {
        focusRow()
        return true
      }}
      onFocusChanged={setFocused}
      onUp={() => {
        const to = focusableFrom(cur() - 1, -1)
        if (to < 0) return false
        focusRow(to)
        return true
      }}
      onDown={() => {
        const to = focusableFrom(cur() + 1, 1)
        if (to >= 0) focusRow(to)
        if (props.onRowsNear) props.onRowsNear(cur())
        return true
      }}
    >
      {/* Sized to its rows: an unsized view takes its parent's size and, once scrolled past it, counts as off screen. */}
      <view
        y={-scrollY()}
        width={1920}
        height={trackH() + TAIL + 1080}
        transition={{ y: { duration: 220, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' } }}
      >
        <For each={keys()}>
          {(k) => {
            // A row on its way out keeps its last place.
            let last
            const at = () => (last = byKey().out[k] || last)
            // A row windowed out lets go of its node, unless the row built again under its key has
            // already set its own.
            let mine = null
            onCleanup(() => {
              if (nodes[k] === mine) delete nodes[k]
            })
            return (
              <Dynamic
                component={kindOf(at().row)}
                ref={(n) => (nodes[k] = mine = n)}
                y={at().y}
                row={at().row}
                box={at().box}
                look={props.look}
                leftNav={props.look.left}
                preview={props.preview}
                dim={dim()}
                startIndex={rowCur[k] || 0}
                onRowFocus={hand.onRowFocus}
                onRowSelect={hand.onRowSelect}
                onRowSeeAll={hand.onRowSeeAll}
                onRowLoadMore={hand.onRowLoadMore}
                onRowCur={hand.onRowCur}
                onRowGrow={hand.onRowGrow}
                onCardPreview={hand.onCardPreview}
                onPointerRow={() => focusRow(rows().findIndex((r) => r.key === k))}
              />
            )
          }}
        </For>
      </view>
    </view>
  )
}
