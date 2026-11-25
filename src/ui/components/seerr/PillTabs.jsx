import { For, Show, createMemo, createSignal } from 'solid-js'
import { uiFont } from '../../text.js'
import { theme, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { textWidth } from './look.js'
import { cssShadow } from '../account/gradient.js'
import { pointerFocus } from '../../../app/pointer.js'

// The pill track Search and the Seerr requests screen pick a tab from. It owns Left, Right and
// Enter and lets the rest bubble. With `expanded` on, focus picks the tab as it lands, otherwise
// only Enter does. The holder hears onTabSelect(id) and onTabFocus(id). `maxW` keeps a long bar
// inside the page, and it slides to show the focused tab. Its node has select(id), placed() (each
// tab's { id, x, w }) and shift().
const tabWidth = (label, active) => Math.round(textWidth(label, 19, active ? 'bold' : 'medium') + 50)
// The focused tab's box-shadow: a soft white glow and a drop shadow under it.
const GLOWS = [
  { color: '#ffffff40', x: 0, y: 0, blur: 14, spread: 1 },
  { color: '#00000059', x: 0, y: 8, blur: 18, spread: 0 },
]

export default function PillTabs(props) {
  const [cur, setCur] = createSignal(0)
  const [on, setOn] = createSignal(false)
  const [shift, setShift] = createSignal(0)
  let entered = false
  const font = uiFont('medium')
  const activeFont = uiFont('bold')
  const t = () => theme()
  const tabs = () => props.tabs || []
  const placed = createMemo(() => {
    let x = 4
    return tabs().map((tab, i) => {
      const active = tab.id === props.activeId
      const w = tabWidth(tab.label, active)
      const at = x
      x += w
      return { id: tab.id, label: tab.label, x: at, w, i, active }
    })
  })
  const fullW = () => {
    const p = placed()
    const last = p[p.length - 1]
    return last ? last.x + last.w + 4 : 0
  }
  const barW = () => (props.maxW ? Math.min(fullW(), props.maxW) : fullW())
  const focusAt = () => (on() ? cur() : -1)
  const glows = createMemo(() => {
    const tab = placed()[focusAt()]
    if (!tab) return []
    return GLOWS.map((g) => {
      const box = cssShadow(tab.w, 55, 27.5, { ...g, color: shadowColor(g.color) })
      return { ...box, x: tab.x + box.x, y: 4 + box.y }
    })
  })
  const reveal = () => {
    const tab = placed()[cur()]
    if (!tab || !props.maxW || fullW() <= props.maxW) return setShift(0)
    if (tab.x < shift()) setShift(tab.x)
    else if (tab.x + tab.w > shift() + props.maxW) setShift(tab.x + tab.w - props.maxW)
  }
  const move = (delta) => {
    const next = cur() + delta
    if (next < 0 || next >= tabs().length) return false
    setCur(next)
    reveal()
    const id = tabs()[next].id
    if (props.onTabFocus) props.onTabFocus(id)
    if (props.expanded !== false && props.onTabSelect) props.onTabSelect(id)
    return true
  }
  // The Magic Remote's cursor focuses the tab under it, and OK then opens it (app/pointer.js).
  let self
  const point = (id) => {
    pointerFocus(self)
    const at = tabs().findIndex((tab) => tab.id === id)
    if (at >= 0 && at !== cur()) {
      setCur(at)
      entered = true
      reveal()
    }
  }
  return (
    <view
      ref={(n) => {
        self = n
        // Focus lands on this tab the next time the bar takes focus.
        n.select = (id) => {
          const at = tabs().findIndex((tab) => tab.id === id)
          if (at < 0) return
          setCur(at)
          entered = true
          reveal()
        }
        n.placed = placed
        n.shift = shift
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={barW()}
      height={63}
      borderRadius={31.5}
      color="#ffffff14"
      clipping
      alpha={props.alpha == null ? 1 : props.alpha}
      onFocusChanged={(has) => {
        setOn(has)
        if (!has) return
        const at = tabs().findIndex((tab) => tab.id === props.activeId)
        if (at >= 0 && !entered) setCur(at)
        entered = false
        reveal()
      }}
      onLeft={() => move(-1)}
      onRight={() => move(1)}
      onEnter={() => {
        const tab = tabs()[cur()]
        if (tab && props.onTabSelect) props.onTabSelect(tab.id)
        return true
      }}
    >
      <view x={-shift()} width={fullW()} height={63}>
        <view width={fullW()} height={63}>
          <For each={glows()}>
            {(g) => <view x={g.x} y={g.y} width={g.w} height={g.h} borderRadius={g.r} color="#00000000" shadow={g.shadow} />}
          </For>
        </view>
        <view width={fullW()} height={63}>
          <For each={placed()}>
            {(tab) => (
              <view x={tab.x} y={4} width={tab.w} height={55} onPointerOver={() => point(tab.id)}>
                <Show when={tab.active}>
                  <view width={tab.w} height={55} borderRadius={27.5} color={t().accent} />
                </Show>
                <view
                  width={tab.w}
                  height={55}
                  borderRadius={27.5}
                  color="#00000000"
                  border={{ width: 3, color: hex(t().focus) }}
                  alpha={tab.i === focusAt() ? 1 : 0}
                />
                <text
                  fontFamily={tab.active ? activeFont : font}
                  fontSize={19}
                  lineHeight={26.6}
                  x={25}
                  y={14.2}
                  color={tab.active ? '#ffffff' : '#ffffffbf'}
                >
                  {tab.label}
                </text>
              </view>
            )}
          </For>
        </view>
      </view>
    </view>
  )
}
