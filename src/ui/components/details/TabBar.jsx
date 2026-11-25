import { Index, createMemo, createSignal } from 'solid-js'
import { textWidth } from './measure.js'
import { themeSpacing, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { pointerFocus } from '../../../app/pointer.js'

// The details tab bar: pills butted together on one translucent track, the open tab filled with
// the accent, the focused one ringed. A bar wider than the page scrolls inside its outline by the
// least that shows the whole tab. With Expanded Tabs on, focus opens the tab it lands on.
//
// Props: `tabs` [{id, label}], `active` (the open tab's id), `maxW`, `tokens`, `x`, `y`. Calls
// onTabFocus(id) on each move, onTabEnter(id) on Enter and onTabsEdge('right') off the last tab.
// Up, Down and Left off the first tab go on to the page. Its node has current() and select(id).
const PILL_H = 55
const PAD = 4
// The focused tab's two shadows, the white glow and the drop under it.
const GLOW = { color: shadowColor('#ffffff40'), x: 0, y: 0, blur: 14, spread: 1 }
const DROP = { color: shadowColor('#00000059'), x: 0, y: 8, blur: 18, spread: 0 }

const pillWidth = (label, active) => 3 + 22 + textWidth(label, 19, active ? 'bold' : 'medium') + 22 + 3

export default function TabBar(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const tabs = () => props.tabs || []
  const t = () => props.tokens || { accent: '#0a84ffff', onAccent: '#ffffffff', focus: '#00a4dcff', os: (a) => '#ffffff' + Math.round(a * 255).toString(16) }
  const pills = createMemo(() => {
    let x = PAD
    return tabs().map((tab) => {
      const on = tab.id === props.active
      const w = pillWidth(tab.label, on)
      const out = { id: tab.id, label: tab.label, x, w, on }
      x += w
      return out
    })
  })
  const inner = () => {
    const p = pills()
    return p.length ? p[p.length - 1].x + p[p.length - 1].w + PAD : 0
  }
  const barW = () => Math.min(inner(), props.maxW || 1688)
  // Pixel themes square off the bar and its tabs.
  const square = () => Boolean(t().isPixel)
  const ring = () => pills()[cur()] || { x: 0, w: 0 }

  const current = () => tabs()[cur()]
  const reveal = () => {
    const p = pills()[cur()]
    if (!p) return
    const w = barW()
    if (p.x < scroll()) setScroll(p.x)
    else if (p.x + p.w > scroll() + w) setScroll(p.x + p.w - w)
  }
  const notify = () => {
    const tab = current()
    if (tab && props.onTabFocus) props.onTabFocus(tab.id)
  }
  const move = (d) => {
    const next = cur() + d
    if (next < 0 || next >= tabs().length) return false
    setCur(next)
    reveal()
    notify()
    return true
  }
  // The Magic Remote's cursor focuses the tab under it, and OK then opens it (app/pointer.js).
  let self
  const point = (i) => {
    pointerFocus(self)
    if (cur() !== i) {
      setCur(i)
      reveal()
    }
  }
  return (
    <view
      ref={(n) => {
        self = n
        n.current = current
        n.select = (id) => {
          const i = tabs().findIndex((tab) => tab.id === id)
          if (i >= 0) setCur(i)
          reveal()
        }
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={barW()}
      height={63}
      alpha={tabs().length ? 1 : 0}
      onFocusChanged={(has) => {
        setFocused(has)
        if (!has) return
        const i = tabs().findIndex((tab) => tab.id === props.active)
        if (i >= 0) setCur(i)
        reveal()
        notify()
      }}
      onLeft={() => move(-1)}
      onRight={() => {
        if (!move(1) && props.onTabsEdge) props.onTabsEdge('right')
        return true
      }}
      onEnter={() => {
        const tab = current()
        if (tab && props.onTabEnter) props.onTabEnter(tab.id)
        return true
      }}
    >
      <view width={barW()} height={63} borderRadius={square() ? 0 : 31.5} color={t().os(0.08)} />
      <view width={barW()} height={63} clipping>
        <view x={-scroll()} width={inner()} height={63}>
          <view width={inner()} height={63}>
            <Index each={pills()}>
              {(p, i) => (
                <view x={p().x} y={4} width={p().w} height={PILL_H} onPointerOver={() => point(i)}>
                  <view width={p().w} height={PILL_H} borderRadius={square() ? 0 : 27.5} color={p().on ? t().accent : '#00000000'} />
                  <text
                    x={25}
                    y={15.7}
                    fontFamily={uiFont(p().on ? 'bold' : 'medium')}
                    fontSize={19}
                    lineHeight={26.6}
                    letterSpacing={themeSpacing()}
                    color={p().on ? t().onAccent : t().os(0.75)}
                  >
                    {p().label}
                  </text>
                </view>
              )}
            </Index>
          </view>
          <view x={ring().x} y={4} width={ring().w} height={PILL_H} borderRadius={square() ? 0 : 27.5} color="#00000000" alpha={focused() ? 1 : 0} shadow={DROP} />
          <view x={ring().x} y={4} width={ring().w} height={PILL_H} borderRadius={square() ? 0 : 27.5} color="#00000000" alpha={focused() ? 1 : 0} shadow={GLOW} />
          <view
            x={ring().x}
            y={4}
            width={ring().w}
            height={PILL_H}
            borderRadius={square() ? 0 : 27.5}
            color="#00000001"
            border={{ width: 3, color: hex(t().focus) }}
            alpha={focused() ? 1 : 0}
          />
        </view>
      </view>
    </view>
  )
}
