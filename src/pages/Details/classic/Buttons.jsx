import { For, createMemo, createSelector, createSignal } from 'solid-js'
import { uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { glowShadow } from '../../../ui/theme.js'
import { textWidth } from '../../../ui/components/details/measure.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import { holdPress } from '../../../utils/longPress.js'
import { clip } from './layout.js'
import { plumbIndex } from './scroll.js'
import { pointerFocus } from '../../../app/pointer.js'

// Classic's action tiles: a rounded square with an icon, the label under it and a detail line for
// the pickers. Focus fills the square, scales it to 1.1 and rings it.
//
// Props: `placed` (from layoutButtons), `held` (laid out but hidden while the row waits for its
// loads), `tokens`, and `lane` ({x, w}) when Action Buttons on Screen is All and the tiles run on one
// line that scrolls sideways. Left and Right move along a line and stop at its ends, so tiles on a
// second line are drawn but never take focus. Left off the first calls onEdge('left'), and Up and
// Down go on to the page. Enter calls onAction(id). Play and Resume act on release so a hold can
// call onActionLong(id). Its node has current(), selectFirst() and selectNear(x).
const DEFAULT_T = {
  buttonNormal: '#ffffff1f', buttonFocused: '#fffffff2', onButtonNormal: '#ffffffff', onButtonFocused: '#0a0a0aff', focus: '#ffffffff', accent: '#00a4dcff', recordingActive: '#ff4757ff',
  onSurface: '#ffffffff', onBackground: '#ffffffff', os: () => '#ffffff80',
}
const GONE = { k: '', id: '', x: 0, y: 0, h: 0, icon: '', glyph: false, label: '', labelLines: [], detail: '', state: '', i: -1 }
const GONE_LINE = { k: '', x: 0, y: 0, t: '' }
const GROW = { scale: { duration: 200 } }
// Neon Pulse edges each tile in pink with a soft glow.
const NEON_EDGE = hex('#ff2e9280')
const NEON_GLOW = glowShadow({ color: '#ff2e9233', x: 0, y: 0, blur: 10, spread: 0 }).shadow

export default function ClassicButtons(props) {
  const [cur, setCur] = createSignal(0)
  const [shift, setShift] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const t = () => props.tokens || DEFAULT_T
  const placed = () => props.placed || []
  const bold = () => uiFont('bold')
  const regular = () => uiFont('regular')
  const r = () => (t().isPixel ? 0 : 22)
  const isOn = createSelector(() => (focused() ? cur() : -1))
  const tiles = byKey(() => placed().map((b, i) => ({ ...b, k: `${b.id}-${i}`, i })), GONE)
  const lines = byKey(() => {
    const out = []
    placed().forEach((b, i) =>
      b.labelLines.forEach((ln, j) => out.push({ k: `${b.id}-${i}-${j}`, x: b.x + (157 - textWidth(ln, 16, 'bold')) / 2, y: b.y + 98 + j * 20.8 + 1.5, t: ln })),
    )
    return out
  }, GONE_LINE)
  // The lane clips its tiles at the content's edges, with room above and below for a focused one.
  // Without one the box spans the tiles, so the renderer never culls them while they show.
  const box = createMemo(() => {
    const all = placed()
    const first = all[0]
    const last = all[all.length - 1]
    if (!props.lane || !first) return { x: 0, y: 0, w: 1920, h: Math.max(1080, last ? last.y + last.h + 40 : 0) }
    return { x: props.lane.x, y: first.y - 20, w: props.lane.w, h: 220 }
  })
  const spanW = () => {
    const all = placed()
    return Math.max(1920, all.length ? all[all.length - 1].x + 157 + 50 : 0)
  }

  const current = () => placed()[cur()] || null
  // A tile past either side of the one line lane comes back in with 50px to spare.
  const reveal = () => {
    const lane = props.lane
    const b = current()
    const all = placed()
    if (!lane || !b || !all.length) return
    const last = all[all.length - 1]
    const max = Math.max(0, last.x + 157 + 6 + 40 - (lane.x + lane.w))
    let s = shift()
    if (b.x - s < lane.x) s -= lane.x - (b.x - s) + 50
    else if (b.x + 157 - s > lane.x + lane.w) s += b.x + 157 - s - (lane.x + lane.w) + 50
    setShift(Math.max(0, Math.min(max, s)))
  }
  let self
  const move = (d) => {
    const b = current()
    const next = placed()[cur() + d]
    if (!b || !next || next.line !== b.line) return false
    setCur(cur() + d)
    reveal()
    return true
  }

  const hold = holdPress()

  return (
    <view
      ref={(n) => {
        self = n
        n.current = current
        n.selectFirst = () => {
          setCur(0)
          setShift(0)
        }
        // Entering from a box above takes the first line's tile nearest its middle.
        n.selectNear = (x) => {
          const line = placed().filter((b) => b.line === 0)
          setCur(Math.max(0, plumbIndex(line.map((b) => ({ x: b.x - shift(), w: 157 })), x)))
          reveal()
        }
        if (props.ref) props.ref(n)
      }}
      alpha={props.held ? 0 : 1}
      x={box().x}
      y={box().y}
      width={box().w}
      height={box().h}
      clipping={!!props.lane}
      onFocusChanged={(has) => {
        setFocused(has)
        if (!has) hold.cancel()
      }}
      onLeft={() => {
        if (!move(-1) && props.onEdge) props.onEdge('left')
        return true
      }}
      onRight={() => {
        move(1)
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
      <view x={-box().x - shift()} y={-box().y} width={spanW()} height={box().y + box().h}>
        <view
          width={spanW()}
          height={box().y + box().h}
          // The Magic Remote's cursor focuses the button under it, and OK then presses it (app/pointer.js).
          onPointerChildOver={(i) => {
            const b = tiles.at(tiles.keys()[i])
            if (!b) return
            pointerFocus(self)
            if (b.i !== cur()) {
              setCur(b.i)
              reveal()
            }
          }}
        >
          <For each={tiles.keys()}>
            {(k) => {
              const b = () => tiles.at(k)
              const on = () => isOn(b().i)
              const stateInk = () => (b().state === 'favorited' ? t().recordingActive : b().state === 'watched' ? t().accent : '')
              const detailW = () => (b().detail ? Math.min(on() ? 160 : 100, textWidth(b().detail, 13)) : 0)
              return (
                <view x={b().x} y={b().y} width={157} height={b().h}>
                  <view x={35.5} width={86} height={86} pivot={0.5} transition={GROW} scale={on() ? 1.1 : 1}>
                    <view alpha={t().neon ? 1 : 0} width={86} height={86} borderRadius={r()} color="#00000000" shadow={NEON_GLOW} />
                    <view width={86} height={86} borderRadius={r()} color={on() ? t().buttonFocused : t().buttonNormal} />
                    <view width={86} height={86} borderRadius={r()} color="#00000001" border={{ width: 1, color: NEON_EDGE }} alpha={t().neon && !on() ? 1 : 0} />
                    <view width={86} height={86} borderRadius={r()} color="#00000001" border={{ width: 1, color: hex(t().focus) }} alpha={on() ? 1 : 0} />
                    <view
                      x={b().glyph ? 26.5 : 23.5}
                      y={b().glyph ? 24 : 23.5}
                      width={b().glyph ? 34 : 39}
                      height={b().glyph ? 34 : 39}
                      src={b().glyph ? 'icons/cls_play_glyph.webp' : `icons/d/${b().icon}.webp`}
                      color={stateInk() || (on() ? t().onButtonFocused : t().onButtonNormal)}
                    />
                  </view>
                  <text
                    letterSpacing={t().spacing || 0}
                    x={(157 - (on() ? 160 : detailW())) / 2}
                    y={98 + b().labelLines.length * 20.8 + 2 + 1}
                    fontFamily={regular()}
                    fontSize={13}
                    lineHeight={33}
                    maxWidth={on() ? 160 : 100}
                    maxLines={on() ? 3 : 1}
                    contain="width"
                    textAlign={on() ? 'center' : 'left'}
                    color={on() ? t().onBackground : t().os(0.5)}
                  >
                    {b().detail ? (on() ? b().detail : clip(b().detail, 13, 'regular', 100)) : ''}
                  </text>
                </view>
              )
            }}
          </For>
        </view>
        <view width={spanW()} height={box().y + box().h}>
          <For each={lines.keys()}>
            {(k) => (
              <text x={lines.at(k).x} y={lines.at(k).y} fontFamily={bold()} fontSize={16} lineHeight={20.8} letterSpacing={t().spacing || 0} color={t().onSurface}>
                {lines.at(k).t}
              </text>
            )}
          </For>
        </view>
      </view>
    </view>
  )
}
