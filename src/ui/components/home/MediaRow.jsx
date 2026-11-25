import $L from '../../../services/i18n.js'
import { For, Show, batch, createEffect, createMemo, createSelector, createSignal, on, onCleanup, untrack } from 'solid-js'
import ModernCard from './ModernCard.jsx'
import ClassicCard from './ClassicCard.jsx'
import CarouselPanel, { panelBackdrop } from './CarouselPanel.jsx'
import RatingsRow from './RatingsRow.jsx'
import { preloadUrls } from './artPreload.js'
import { laneWindow } from './rowLayout.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import { nearRowEnd } from '../../../utils/rowPaging.js'
import * as settings from '../../../state/settings.js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { menuHold } from '../modals/menuHold.js'
import { tx } from '../../fx.js'
import { usePage } from '../../../app/PageStack.jsx'
import { afterDraw } from '../../afterDraw.js'
import { getRenderer } from '@solidtv/solid'

// One of Home's rows in the Classic, Modern or Carousel look. The row owns Left, Right and Enter.
// Up and Down go to the page. The focused card parks at the row's leading edge, grows to its wide
// art once that has loaded, and in a Carousel row its title fills the panel under the cards. A row
// out of focus keeps its place and shows every card at rest. Only the cards near the screen exist,
// so a row of forty keeps a dozen alive.
//
// Props: `row` (a shaped row with `cards` and `seeAll`), `box` (rowLayout.rowBox), `look`, `leftNav`,
// `preview` (the 'rowKey|cardKey' whose preview plays), `startIndex`, `x`, `y`, `ref`. It calls
// onRowFocus(card, rowKey, index) once focus has rested on a card for 50ms, onRowSelect(card,
// rowKey, index) on Enter, onRowSeeAll(row), onRowLoadMore(rowKey) near the end, onRowGrow(rowKey,
// h) as a grown Modern card's text outgrows the row, onRowCur(rowKey, index) on every move, and
// onCardPreview(rowKey, card, rect) as focus settles (card null when it leaves). Its node has
// focusIndex(i) and cur().

// How long a card waits for its wide art before it opens anyway.
const ART_WAIT_MS = 300
const FOCUS_ITEM_MS = 50
const OPEN_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
// Lane pixels kept built past either edge of the clip, a card's step or more, so a glide never
// uncovers an empty spot.
// shortcut: a wrap from the last card to the first builds only the cards it lands on, so its fast
// glide passes an empty lane for a frame or two. Build the cards it sweeps past if that shows on a TV.
const MARGIN = 450

// Whether the renderer has this art uploaded, so a node showing it draws on its first frame. It
// looks under the same key a node with this src takes its texture from.
const artReady = (url) => {
  const tx = getRenderer().stage.txManager
  const t = tx.getTextureFromCache(tx.txConstructors.ImageTexture.makeCacheKey({ src: url }))
  return !!t && t.state === 'loaded'
}

export default function MediaRow(props) {
  const [cur, setCur] = createSignal(Math.max(0, props.startIndex || 0))
  const [landing, setLanding] = createSignal(Math.max(0, props.startIndex || 0))
  const [focused, setFocused] = createSignal(false)
  const [open, setOpen] = createSignal(false)
  const [ratingsH, setRatingsH] = createSignal(0)
  // The art the cards either side of focus show once focused (artPreload.js), and the way focus last moved.
  const [warm, setWarm] = createSignal([])
  let dir = 1
  const isCur = createSelector(cur)
  let ring
  const cardNodes = {}
  let waitTimer = null
  let noteTimer = null
  let reopen = null
  // Whether focus left with the whole page (another page opened over it), so it comes back by Back.
  let leftWithPage = false
  const page = usePage()
  onCleanup(() => {
    clearTimeout(waitTimer)
    clearTimeout(noteTimer)
    if (reopen) reopen()
  })

  const L = () => props.look
  const cards = () => props.row.cards || []
  const count = () => cards().length + (props.row.seeAll ? 1 : 0)
  const onSeeAll = () => !!props.row.seeAll && cur() === cards().length
  // Holding OK on a card opens its long press menu, and a short press opens the card as it lets go.
  const hold = menuHold(
    () => (onSeeAll() || !cards()[cur()] ? null : cards()[cur()].raw || null),
    () => {
      const c = cards()[cur()]
      if (c && props.onRowSelect) props.onRowSelect(c, props.row.key, cur())
    },
    () => props.row.key,
  )
  // On See All the panel keeps the card focus left.
  const card = createMemo(() => cards()[onSeeAll() ? landing() : cur()] || cards()[0])
  const carousel = () => !!props.box.carousel
  const classic = () => L().style === 'classic' || !!props.row.forceClassic
  // The row slides on the cards' own curve while they open, and glides on an ease-out otherwise.
  const glide = () => (L().openMs ? OPEN_EASE : 'cubic-bezier(0.33, 1, 0.68, 1)')
  const playing = () => {
    const p = props.preview || ''
    return p.indexOf(props.row.key + '|') === 0 ? p.slice(props.row.key.length + 1) : ''
  }
  // The focused card's extra width once it has grown, which pushes the cards after it along.
  const extra = createMemo(() => {
    const c = card()
    return c && !classic() && focused() && open() ? c.ew - c.w : 0
  })
  const laneW = () => {
    const sa = props.row.seeAll
    if (sa) return sa.x + sa.w + extra()
    const last = cards()[cards().length - 1]
    return last ? last.x + last.w + extra() : 0
  }
  // The focused card at the leading edge, as far as the lane can scroll.
  const scroll = createMemo(() => {
    const c = card()
    if (!c) return 0
    const max = Math.max(0, L().pad * 2 + laneW() - L().viewW)
    return Math.min(onSeeAll() ? props.row.seeAll.x : c.x, max)
  })
  const shown = createMemo(() => {
    const [from, to] = laneWindow(cards(), scroll() - L().pad, scroll() - L().pad + L().viewW + extra(), MARGIN)
    return cards().slice(from, to)
  })
  const ringBox = () => {
    const c = card()
    return { x: c ? c.x : 0, w: c ? (focused() && open() ? c.ew : c.w) : 0, h: c ? c.h : 0 }
  }
  // The overview under a grown card reaches to the row's right edge.
  const detailsW = () => {
    const c = card()
    if (!c) return 0
    return Math.max(c.ew, L().viewW - L().pad - (L().pad + c.x - scroll()))
  }
  // A grown Modern card's text runs below the room the row keeps for captions, so the row grows with
  // it. The section under the lines is 8px down and 150px tall, since its ratings and three lines of
  // overview reach 66.5 + 81px at most and never outgrow that floor.
  const grow = createMemo(() => {
    const c = card()
    if (!c || carousel() || classic() || !focused() || !open() || !c.expands) return 0
    return Math.max(0, 8 + L().modernCardTitle * 1.2 + c.focusLines.length * 26 + 158 - 89)
  })
  // A grown Modern card's ratings, drawn once for the row under whichever card is open.
  const ratingsItem = createMemo(() => {
    const c = card()
    return c && !carousel() && !classic() && focused() && open() && c.expands ? c.raw : null
  })
  createEffect(on(ratingsItem, (it) => !it && setRatingsH(0), { defer: true }))
  // The compact ratings row's 8px top margin collapses into the section's, so it starts where the section does.
  const ratingsY = () => {
    const c = card()
    return c && c.focusLines ? c.h + 8 + L().modernCardTitle * 1.2 + c.focusLines.length * 26 : 0
  }
  const mdb = createMemo(() => isMdblistEnabled(settings.all(), 'homeRows'))
  const titleFont = () => uiFont('bold')
  const subtitleFont = () => fontFor(props.row.subtitle || '', 'bold')
  const seeAllText = $L('See All').toUpperCase()
  const laneY = () => (classic() ? 20 : 10)
  // The lane and its layers span every card, since an unsized view takes its parent's size and,
  // scrolled past that, counts as off screen with everything in it.
  const spanW = () => L().pad * 2 + laneW() + 1920
  const spanH = () => props.box.laneH + grow()

  // Reported only when it changes.
  createEffect(on(grow, (h) => props.onRowGrow && props.onRowGrow(props.row.key, h), { defer: true }))

  // With the cards animating, the panel cross fades from the title it showed to the next on the same
  // timing. Otherwise one panel takes each title in place. Each title gets a panel of its own, keyed
  // by the item's id.
  const panelItem = () => (card() ? card().raw : null)
  const [panelA, setPanelA] = createSignal(untrack(panelItem))
  const [panelB, setPanelB] = createSignal(null)
  const [front, setFront] = createSignal('a')
  createEffect(
    on(
      panelItem,
      (item) => {
        if (!L().openMs) return
        const shown = front() === 'a' ? panelA() : panelB()
        if (shown && item && shown.Id === item.Id) (front() === 'a' ? setPanelA : setPanelB)(item)
        else if (!shown) setPanelA(item)
        else if (front() === 'a') batch(() => (setPanelB(item), setFront('b')))
        else batch(() => (setPanelA(item), setFront('a')))
      },
      { defer: true },
    ),
  )
  const panels = createMemo(() => {
    if (!carousel()) return {}
    if (!L().openMs) return { a: { item: panelItem(), on: true } }
    const keyOf = (it, slot) => slot + (it ? it.Id : '')
    return {
      [keyOf(panelA(), 'a')]: { item: panelA(), on: front() === 'a' },
      [keyOf(panelB(), 'b')]: { item: panelB(), on: front() === 'b' },
    }
  })
  const panelKeys = createMemo(() => Object.keys(panels()), undefined, { equals: (a, b) => a.join() === b.join() })

  // A reload can leave the remembered card past the end.
  createEffect(
    on(
      cards,
      (list) => {
        if (cur() >= count()) setCur(Math.max(0, list.length - 1))
        if (landing() >= list.length) setLanding(Math.max(0, list.length - 1))
      },
      { defer: true },
    ),
  )

  // The card's art in screen pixels, read when the preview attaches.
  const rectOf = (c) => () => ({
    x: L().clipX + L().pad + c.x - scroll(),
    y: props.box.scrollerY + laneY(),
    w: !classic() && open() && focused() ? c.ew : c.w,
    h: c.h,
    r: classic() ? (c.circle ? c.w / 2 : L().classicRadius) : L().modernRadius,
  })

  // The card just focused opens at once when its wide art is in, or after a short wait.
  const settle = () => {
    const c = cards()[cur()]
    clearTimeout(waitTimer)
    clearTimeout(noteTimer)
    if (!c) {
      setOpen(false)
      return
    }
    const now = !c.waits || artReady(c.wide)
    setOpen(now)
    if (!now) waitTimer = setTimeout(() => setOpen(true), ART_WAIT_MS)
    const list = cards()
    if (!classic()) setWarm(preloadUrls(list, cur(), dir, carousel() ? panelBackdrop : null))
    const at = cur()
    noteTimer = setTimeout(() => props.onRowFocus && props.onRowFocus(c, props.row.key, at), FOCUS_ITEM_MS)
    // Every row style's card preview waits out its dwell on the art's place once the row has
    // settled. A Classic card drops its zoom and plays at its resting size.
    if (props.onCardPreview) props.onCardPreview(props.row.key, c, rectOf(c))
    // Focus a few cards from the end reads the row's next page.
    if (props.row.hasMore && nearRowEnd(at, list.length) && props.onRowLoadMore) props.onRowLoadMore(props.row.key)
  }
  const onArtIn = (url) => {
    const c = cards()[cur()]
    if (c && c.wide === url && focused()) setOpen(true)
  }
  const move = (to, way) => {
    if (to === cur() || to < 0 || to >= count()) return
    dir = way
    batch(() => {
      setCur(to)
      if (to < cards().length) setLanding(to)
      if (to < cards().length) settle()
      else {
        // See All has no art to open or preview.
        clearTimeout(waitTimer)
        setOpen(false)
        if (props.onCardPreview) props.onCardPreview(props.row.key, null)
      }
    })
    if (props.onRowCur) props.onRowCur(props.row.key, to)
  }

  const onFocusChanged = (has) => {
    setFocused(has)
    if (reopen) reopen()
    reopen = null
    if (has) {
      if (cur() >= cards().length) return
      // Back onto the page draws it before the card opens again, which brings Home back a frame
      // sooner on webOS.
      if (leftWithPage) {
        leftWithPage = false
        reopen = afterDraw(getRenderer(), () => {
          reopen = null
          if (focused()) batch(settle)
        })
        return
      }
      batch(settle)
      return
    }
    leftWithPage = !!page && !page.active()
    setOpen(false)
    setWarm([])
    clearTimeout(waitTimer)
    if (props.onCardPreview) props.onCardPreview(props.row.key, null)
  }

  const sa = () => props.row.seeAll
  const saOn = () => onSeeAll() && focused()
  return (
    <view
      ref={(n) => {
        // Where focus lands coming back into the row.
        n.focusIndex = (i) => {
          const to = Math.max(0, Math.min(i, cards().length - 1))
          batch(() => (setCur(to), setLanding(to)))
        }
        n.cur = cur
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={1920}
      height={props.box.h}
      focusTarget={() => (classic() ? cardNodes[cur()] : ring)}
      onFocusChanged={onFocusChanged}
      onLeft={() => {
        if (cur() > 0) move(cur() - 1, -1)
        // With the sidebar, Left from the first card goes to it. With the top bar, it wraps to the last.
        else if (props.leftNav) return false
        else move(count() - 1, -1)
        return true
      }}
      onRight={() => {
        move(cur() < count() - 1 ? cur() + 1 : 0, 1)
        return true
      }}
      onCaptureEnter={hold.down}
      onCaptureEnterRelease={hold.up}
      onMenu={hold.menu}
      onEnter={() => {
        if (onSeeAll()) {
          if (props.onRowSeeAll) props.onRowSeeAll(props.row)
          return true
        }
        const c = cards()[cur()]
        if (c && props.onRowSelect) props.onRowSelect(c, props.row.key, cur())
        return true
      }}
    >
      <text
        x={L().inset}
        y={props.box.titleY + cssShift(classic() ? 28 : L().modernTitleSize)}
        fontFamily={titleFont()}
        fontSize={classic() ? 28 : L().modernTitleSize}
        lineHeight={33}
        maxWidth={L().viewW - L().pad * 2}
        maxLines={1}
        color={L().onSurface}
      >
        {props.row.title || ''}
      </text>
      <Show when={props.row.subtitle}>
        <text x={L().inset} y={props.box.subtitleY + cssShift(18)} fontFamily={subtitleFont()} fontSize={18} lineHeight={33} color={L().rowSubtitle}>
          {props.row.subtitle}
        </text>
      </Show>
      <view x={L().clipX} y={props.box.scrollerY} width={L().viewW} height={props.box.laneH + grow()} clipping>
        <view
          y={laneY()}
          x={L().pad - scroll()}
          width={spanW()}
          height={spanH()}
          transition={tx({ x: { duration: L().openMs || 220, easing: glide() } })}
        >
          <view width={spanW()} height={spanH()}>
            <Show when={!classic()}>
              <For each={shown()}>
                {(c) => {
                  const mine = () => isCur(c.idx) && focused()
                  return (
                    <ModernCard
                      card={c}
                      x={c.x + (c.idx > cur() ? extra() : 0)}
                      w={mine() && extra() > 0 ? c.ew : c.w}
                      focused={mine()}
                      open={mine() && open()}
                      look={L()}
                      carousel={carousel()}
                      dw={detailsW()}
                      rh={ratingsH()}
                      vid={c.key === playing()}
                      onArtIn={onArtIn}
                    />
                  )
                }}
              </For>
            </Show>
          </view>
          <view width={spanW()} height={spanH()}>
            <Show when={classic()}>
              <For each={shown()}>
                {(c) => (
                  <ClassicCard
                    ref={(n) => (cardNodes[c.idx] = n)}
                    card={c}
                    x={c.x}
                    focused={isCur(c.idx) && focused()}
                    look={L()}
                    vid={c.key === playing()}
                  />
                )}
              </For>
            </Show>
          </view>
          <view width={spanW()} height={spanH()}>
            <Show when={sa()}>
              <view x={sa().x + extra()} width={sa().w} height={sa().h} borderRadius={20} color="#ffffff14" border={{ width: 3, color: saOn() ? 0xffffffff : 0xffffff00 }}>
                <view
                  x={(sa().w - 53.4) / 2}
                  y={(sa().h - 53.4 - 13.4 - 26) / 2}
                  width={53.4}
                  height={53.4}
                  src={sa().icon}
                  color={saOn() ? '#ffffffff' : '#ffffff99'}
                />
                <text
                  x={0}
                  y={(sa().h - 53.4 - 13.4 - 26) / 2 + 68.8}
                  fontFamily={titleFont()}
                  fontSize={21.7}
                  lineHeight={26}
                  letterSpacing={1.74}
                  maxWidth={sa().w}
                  contain="width"
                  textAlign="center"
                  color={saOn() ? '#ffffffff' : '#ffffff99'}
                >
                  {seeAllText}
                </text>
              </view>
            </Show>
          </view>
          <view
            ref={ring}
            x={ringBox().x}
            width={ringBox().w}
            height={ringBox().h}
            borderRadius={L().modernRadius}
            color="#00000000"
            border={{ width: 4, color: hex(L().focus) }}
            alpha={focused() && !classic() && !onSeeAll() ? 1 : 0}
            transition={tx(L().openMs ? { x: { duration: L().openMs, easing: OPEN_EASE }, width: { duration: L().openMs, easing: OPEN_EASE } } : undefined)}
          />
          <Show when={!classic() && !carousel()}>
            <RatingsRow
              x={ringBox().x}
              y={ratingsY()}
              item={ratingsItem()}
              compact
              singleLineWidth={detailsW()}
              maxW={detailsW()}
              surface="homeRows"
              pluginEnabled={mdb()}
              onLayout={(b) => setRatingsH(b.empty || !untrack(ratingsItem) ? 0 : b.h)}
            />
          </Show>
        </view>
      </view>
      <view>
        <For each={panelKeys()}>
          {(k) => {
            const p = () => panels()[k] || { item: null, on: false }
            return (
              <CarouselPanel
                x={L().inset}
                y={props.box.panelY}
                w={L().viewW - L().pad * 2}
                zIndex={p().on ? 2 : 1}
                alpha={p().on ? 1 : 0}
                transition={tx(L().openMs ? { alpha: { duration: L().openMs } } : undefined)}
                item={p().item}
                look={L()}
                rowFocused={p().on && focused()}
                hideOverview={L().hideOverview}
              />
            )
          }}
        </For>
      </view>
      {/* Just past the screen's right edge, inside the renderer's preload margin, a node loads its
          picture but is never drawn, and its upload waits behind everything on screen. */}
      <view x={1940} y={props.box.scrollerY} width={1} height={1}>
        <For each={warm()}>{(url) => <view width={1} height={1} src={url} />}</For>
      </view>
    </view>
  )
}
