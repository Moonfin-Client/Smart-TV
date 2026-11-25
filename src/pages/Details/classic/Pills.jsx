import { For, createSelector, createSignal } from 'solid-js'
import { hex } from '../../../ui/color.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import { plumbIndex } from './scroll.js'
import { pointerFocus } from '../../../app/pointer.js'

// A line of rounded buttons on Classic's own screens: the person's Favorite and Display, their
// filmography tabs, and the playlist's sort and filter pills. Each pill carries its own resting and
// focused look, so the screens only lay them out.
//
// Props: `pills` [{id, x, y, w, h, r, label, font, size, tx, ty, icon, ix, iy, is, bg, bgOn, bd,
// bdOn, ink, inkOn, scaleOn, badge, bw, bx, badgeFill, badgeFillOn, badgeInkOn}], `zone`, `h` (the
// page's height, which the layer spans) and `spacing` (the theme's letter spacing). Left and Right
// move along the line and call onPillFocus(zone, pill), Left off the first calls onEdge('left'),
// Enter calls onPill(zone, pill), and Up and Down go on to the page. Its node has current(),
// select(i) and selectNear(x), which picks the pill nearest a box above or below.
const GONE = {
  k: '', id: '', x: 0, y: 0, w: 0, h: 0, r: 0, label: '', font: 'roboto', size: 20, tx: 0, ty: 0, icon: '', ix: 0, iy: 0, is: 0,
  bg: '#00000000', bgOn: '#00000000', bd: '#00000000', bdOn: '#00000000', ink: '#00000000', inkOn: '#00000000', scaleOn: 1, badge: '', bw: 0, bx: 0, i: -1,
}
const GROW = { scale: { duration: 200 } }

export default function ClassicPills(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const pills = () => props.pills || []
  const keyed = byKey(() => pills().map((p, i) => ({ ...p, k: `${p.id}-${i}`, i })), GONE)
  const isOn = createSelector(() => (focused() ? cur() : -1))

  const current = () => pills()[cur()] || null
  const move = (d) => {
    const next = cur() + d
    if (next < 0 || next >= pills().length) return false
    setCur(next)
    if (props.onPillFocus) props.onPillFocus(props.zone, current())
    return true
  }

  return (
    <view
      // The Magic Remote's cursor focuses the pill under it, and OK then opens it (app/pointer.js).
      onPointerChildOver={(i, child) => {
        const p = keyed.at(keyed.keys()[i])
        if (!p) return
        pointerFocus(child.parent)
        if (p.i === cur()) return
        setCur(p.i)
        if (props.onPillFocus) props.onPillFocus(props.zone, current())
      }}
      ref={(n) => {
        n.current = current
        n.select = (i) => setCur(Math.max(0, Math.min(i, pills().length - 1)))
        n.selectNear = (x) => setCur(Math.max(0, plumbIndex(pills(), x)))
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={props.h || 1080}
      onFocusChanged={setFocused}
      onLeft={() => {
        if (!move(-1) && props.onEdge) props.onEdge('left')
        return true
      }}
      onRight={() => {
        move(1)
        return true
      }}
      onEnter={() => {
        const p = current()
        if (p && props.onPill) props.onPill(props.zone, p)
        return true
      }}
    >
      <For each={keyed.keys()}>
        {(k) => {
          const p = () => keyed.at(k)
          const on = () => isOn(p().i)
          return (
            <view x={p().x} y={p().y} width={p().w} height={p().h} pivot={0.5} transition={GROW} scale={on() ? p().scaleOn || 1 : 1}>
              <view width={p().w} height={p().h} borderRadius={p().r} color={on() ? p().bgOn : p().bg} />
              <view width={p().w} height={p().h} borderRadius={p().r} color="#00000001" border={{ width: 1, color: hex(on() ? p().bdOn : p().bd) }} />
              <view
                alpha={p().icon ? 1 : 0}
                x={p().ix}
                y={p().iy}
                width={p().is}
                height={p().is}
                src={p().icon || undefined}
                color={on() ? p().inkOn : p().ink}
              />
              <text x={p().tx} y={p().ty} fontFamily={p().font} fontSize={p().size} lineHeight={33} letterSpacing={props.spacing || 0} color={on() ? p().inkOn : p().ink}>
                {p().label}
              </text>
              <view
                alpha={p().badge ? 1 : 0}
                x={p().bx || 0}
                y={(p().h - 17) / 2}
                width={p().bw || 0}
                height={17}
                borderRadius={10}
                color={on() ? p().badgeFillOn || '#ffffffff' : p().badgeFill || '#00a4dcff'}
              >
                <text
                  y={-7}
                  fontFamily={p().font}
                  fontSize={13}
                  lineHeight={33}
                  letterSpacing={props.spacing || 0}
                  maxWidth={p().bw || 1}
                  contain="width"
                  textAlign="center"
                  color={on() ? p().badgeInkOn || '#00a4dcff' : '#ffffffff'}
                >
                  {p().badge}
                </text>
              </view>
            </view>
          )
        }}
      </For>
    </view>
  )
}
