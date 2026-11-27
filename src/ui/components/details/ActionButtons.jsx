import { Index, Show, createEffect, createMemo, createSignal, on } from 'solid-js'
import { textWidth } from './measure.js'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { holdPress } from '../../../utils/longPress.js'
import { BACKDROP_BLUR } from './env.js'
import LoopMarquee from './LoopMarquee.jsx'
import { pointerFocus } from '../../../app/pointer.js'

// Modern's action row: round glass buttons that open into a labeled pill while focused, Play and
// Resume into a wider one with the icon beside the label. The row is clipped to the hero column and
// slides sideways to keep the focused button in view, 50px clear of the edge.
//
// Props: `buttons` [{id, icon, label, detail, primary, active, long}], `w` (the column width), `held`
// (laid out but hidden until the page's loads settle), `tokens` (the theme), `glass` ({src: the
// blurred backdrop, shade, scrim}, what each circle shows through itself) with `ox` and `oy`, where
// the row sits on screen. Left off the first button and Right off the last call
// onActionsEdge('left'|'right'), Enter onAction(id) (or onActionLong(id) when Play or Resume is
// held), and every focus move onActionFocus(id). A label wider than the open pill scrolls
// (LoopMarquee) while it has focus. Its node has current(), select(id) and selectFirst().
const H = 75
const GAP = 12
const CIRCLE = 72
const LABEL_MAX = 175
const RING = hex('#ffffff59')
// The closed pill keeps an icon, since a src that goes away and comes back draws the icon white.
const NO_PILL = { x: 0, w: CIRCLE, label: '', detail: '', icon: 'icons/d/play.webp', iconX: 0, textX: 0, labelY: 0, detailY: 0, textW: LABEL_MAX }

const focusedWidth = (b) => {
  const textW = Math.max(textWidth(b.label, 19, 'bold'), b.detail ? textWidth(b.detail, 17, 'bold') : 0)
  if (b.primary) return Math.max(290, 4 + 15 + 35 + 3 + textW + 20 + 4)
  return 4 + 9 + 70 + 9 + Math.min(LABEL_MAX, textW) + 23 + 4
}

export default function ActionButtons(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const buttons = () => props.buttons || []
  const t = () => props.tokens || { buttonFocused: '#fffffff2', onButtonFocused: '#0a0a12ff', focus: '#00a4dcff' }
  const font = () => uiFont('bold')
  const width = () => props.w || 1595
  // Pixel themes square off every fixed radius.
  const r = () => (t().isPixel ? 0 : 37.5)

  // Each button's left edge and width. Only the focused one opens, so a move shifts the rest.
  const placed = createMemo(() => {
    const out = []
    let x = 0
    buttons().forEach((b, i) => {
      const open = focused() && i === cur()
      const w = open ? focusedWidth(b) : CIRCLE
      out.push({ x, w, open })
      x += w + GAP
    })
    return out
  })
  const total = () => {
    const p = placed()
    return p.length ? p[p.length - 1].x + p[p.length - 1].w : 0
  }
  // The row can't scroll past its end, which moves in when the focused pill closes again.
  const shift = () => Math.max(0, Math.min(scroll(), total() - width()))
  const pill = createMemo(() => {
    const b = buttons()[cur()]
    const p = placed()[cur()]
    if (!b || !p || !p.open) return NO_PILL
    const labelW = textWidth(b.label, 19, 'bold')
    const detailW = b.detail ? textWidth(b.detail, 17, 'bold') : 0
    const blockH = 20.9 + (b.detail ? 18.7 : 0)
    // The renderer sets Roboto higher in its line box, so the label moves down 1.5px.
    const labelY = (H - blockH) / 2 + 1.5
    const icon = `icons/d/${b.icon}.webp`
    if (b.primary) {
      // Centered between the 15px and 20px paddings with the icon right against the label.
      const inner = p.w - 8 - 35
      const content = 35 + 3 + Math.max(labelW, detailW)
      const start = 4 + 15 + (inner - content) / 2
      return { x: p.x, w: p.w, label: b.label, detail: b.detail || '', icon, iconX: start, textX: start + 38, labelY, detailY: labelY + 20.9, textW: 2000 }
    }
    return { x: p.x, w: p.w, label: b.label, detail: b.detail || '', icon, iconX: 13 + 17.5, textX: 92, labelY, detailY: labelY + 20.9, textW: LABEL_MAX }
  })
  // Each closed circle's window onto the blurred backdrop, the shade and the scrim under it, kept
  // still on screen while the page scrolls.
  const glass = () => (BACKDROP_BLUR && props.glass && props.glass.src ? props.glass : null)

  const current = () => buttons()[cur()]
  const reveal = () => {
    const b = placed()[cur()]
    if (!b) return
    const w = width()
    const max = Math.max(0, total() - w)
    let s = shift()
    if (b.x - s < 0) s = b.x - 50
    else if (b.x + b.w - s > w) s = b.x + b.w - w + 50
    setScroll(Math.max(0, Math.min(max, s)))
  }
  const notify = () => {
    const b = current()
    if (b && props.onActionFocus) props.onActionFocus(b.id)
  }
  const move = (d) => {
    const next = cur() + d
    if (next < 0 || next >= buttons().length) return false
    setCur(next)
    reveal()
    notify()
    return true
  }
  createEffect(
    on(buttons, (list) => {
      if (cur() >= list.length) setCur(Math.max(0, list.length - 1))
    }),
  )

  // Play and Resume open Advanced Playback when held, so they act on release. The other buttons act
  // on the press.
  const hold = holdPress()

  return (
    <view
      ref={(n) => {
        n.current = current
        n.select = (id) => {
          const i = buttons().findIndex((b) => b.id === id)
          if (i >= 0) setCur(i)
          reveal()
        }
        n.selectFirst = () => {
          setCur(0)
          setScroll(0)
        }
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={width()}
      height={H}
      clipping
      alpha={props.held ? 0 : 1}
      // The Magic Remote's cursor focuses the button under it, and OK then presses it (app/pointer.js).
      pointerItems={() =>
        placed().map((p) => (p ? { x: (p.open ? pill().x : p.x) - shift(), y: 0, w: p.open ? pill().w : CIRCLE, h: H } : null))
      }
      onPointerItem={(it, i, n) => {
        pointerFocus(n)
        if (cur() !== i) {
          setCur(i)
          reveal()
        }
      }}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) {
          reveal()
          notify()
        } else {
          // A hold that opened Advanced Playback ends there, and its release goes to the sheet.
          hold.cancel()
        }
      }}
      onLeft={() => {
        if (!move(-1) && props.onActionsEdge) props.onActionsEdge('left')
        return true
      }}
      onRight={() => {
        if (!move(1) && props.onActionsEdge) props.onActionsEdge('right')
        return true
      }}
      onEnter={() => {
        const b = current()
        if (!b) return true
        if (!b.long) {
          if (props.onAction) props.onAction(b.id)
          return true
        }
        hold.start(b, () => {
          if (props.onActionLong) props.onActionLong(b.id)
        })
        return true
      }}
      onMenu={() => {
        const b = current()
        if (!b || !b.long || !props.onActionLong) return false
        props.onActionLong(b.id)
        return true
      }}
      onEnterRelease={() => {
        return hold.end((b) => {
          if (props.onAction) props.onAction(b.id)
        })
      }}
    >
      <view x={-shift()} width={total()} height={H}>
        <view width={total()} height={H}>
          <Show when={glass()}>
            <Index each={buttons()}>
              {(b, i) => (
                <GlassWindow
                  x={placed()[i] ? placed()[i].x : 0}
                  open={placed()[i] && placed()[i].open}
                  glass={glass()}
                  r={r()}
                  ix={-((props.ox || 0) + (placed()[i] ? placed()[i].x : 0) - shift())}
                  iy={-(props.oy || 0)}
                />
              )}
            </Index>
          </Show>
        </view>
        <view width={total()} height={H}>
          <Index each={buttons()}>
            {(b, i) => (
              <view x={placed()[i] ? placed()[i].x : 0} width={CIRCLE} height={H} alpha={placed()[i] && placed()[i].open ? 0 : 1}>
                <view width={CIRCLE} height={H} borderRadius={r()} color={b().active ? '#ff47572e' : '#ffffff0f'} border={{ width: 1, color: RING }} />
                <view x={18.5} y={20} width={35} height={35} src={`icons/d/${b().icon}.webp`} color={b().active ? '#ff4757ff' : '#ffffffff'} />
              </view>
            )}
          </Index>
        </view>
        <view x={pill().x} width={pill().w} height={H} alpha={focused() ? 1 : 0}>
          <view width={pill().w} height={H} borderRadius={r()} color={t().buttonFocused} border={{ width: 4, color: hex(t().focus) }} />
          {/* A src set again after none turns the node white, so the tint is set again with it. */}
          <view x={pill().iconX} y={20} width={35} height={35} src={pill().icon || undefined} color={pill().icon ? t().onButtonFocused : '#00000000'} />
          <LoopMarquee
            text={pill().label}
            font={font()}
            weight="bold"
            size={19}
            lh={20.9}
            x={pill().textX}
            y={pill().labelY}
            maxw={pill().textW}
            active={focused()}
            textcolor={t().onButtonFocused}
            alpha={focused() ? 1 : 0}
            transition={{ alpha: { duration: 150 } }}
          />
          <text
            x={pill().textX}
            y={pill().detailY}
            fontFamily={font()}
            fontSize={17}
            lineHeight={18.7}
            color={t().onButtonFocused}
            alpha={pill().detail ? 0.8 : 0}
          >
            {pill().detail}
          </text>
        </view>
      </view>
    </view>
  )
}

// One closed circle's window: the blurred backdrop and the scrim cut to the circle at the part of
// the screen it covers, with the page's shade between them. The blurred backdrop is a 640 wide copy
// (a third of the screen) and the baked scrim 240 wide (an eighth).
// shortcut: the cut jumps to the page's new scroll while the row slides there over 260ms, and a
// backdrop that isn't 16:9 cuts from the wrong rows. Animate the cut if the TVs show it.
function GlassWindow(props) {
  const cut = (k) => ({ x: -props.ix * k, y: Math.max(0, -props.iy * k), w: CIRCLE * k, h: H * k })
  return (
    <view x={props.x} width={CIRCLE} height={H} alpha={props.open ? 0 : 1}>
      <view
        width={CIRCLE}
        height={H}
        borderRadius={props.r}
        src={props.glass.src}
        srcX={cut(1 / 3).x}
        srcY={cut(1 / 3).y}
        srcWidth={cut(1 / 3).w}
        srcHeight={cut(1 / 3).h}
      />
      <view width={CIRCLE} height={H} borderRadius={props.r} color={props.glass.shade} />
      <view
        width={CIRCLE}
        height={H}
        borderRadius={props.r}
        src={props.glass.scrim}
        srcX={cut(1 / 8).x}
        srcY={cut(1 / 8).y}
        srcWidth={cut(1 / 8).w}
        srcHeight={cut(1 / 8).h}
      />
    </view>
  )
}
