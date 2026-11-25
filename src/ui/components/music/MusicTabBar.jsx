import { Index, createMemo } from 'solid-js'
import { lineY } from '../books/bookGrid.js'
import { uiFont } from '../../text.js'
import { tabBarWidth, tabWidths } from '../books/bookText.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'

const NONE = '#00000000'
const GLOW = { color: shadowColor('#ffffff40'), x: 0, y: 0, blur: 14, spread: 1 }
const DROP = { color: shadowColor('#00000059'), x: 0, y: 8, blur: 18, spread: 0 }

// The screen owns the arrows: `tabs` is [{ id, label }], `active` the filled tab's id, and `focus`
// the index ringed or -1. The bar clips its own glow. onPointerTab(i) hears the Magic Remote's cursor
// on a tab, and onPointerTabClick(i), when given, a click on one (app/pointer.js).
export default function MusicTabBar(props) {
  const look = () => props.look
  // Pixel themes square off the bar and its tabs.
  const r = (v) => (look().t.isPixel ? 0 : v)
  const placed = createMemo(() => {
    const tabs = props.tabs || []
    const widths = tabWidths(tabs, props.active)
    let x = 4
    return tabs.map((tab, i) => {
      const out = { id: tab.id, label: tab.label, i, x, w: widths[i], on: tab.id === props.active }
      x += widths[i]
      return out
    })
  })
  const barW = () => tabBarWidth(props.tabs || [], props.active)
  const ring = () => placed()[props.focus] || null
  return (
    <view x={props.x || 0} y={props.y || 0} width={barW()} height={63} borderRadius={r(31.5)} color={look().os(0.08)} clipping>
      <view>
        <Index each={placed()}>
          {(tab) => <view x={tab().x} y={4} width={tab().w} height={55} borderRadius={r(27.5)} color={tab().on ? look().accent : NONE} />}
        </Index>
      </view>
      <view x={ring() ? ring().x : 0} y={4} width={ring() ? ring().w : 0} height={55} alpha={ring() ? 1 : 0}>
        <view width={ring() ? ring().w : 0} height={55} borderRadius={r(27.5)} color={NONE} shadow={DROP} />
        <view width={ring() ? ring().w : 0} height={55} borderRadius={r(27.5)} color={NONE} shadow={GLOW} />
        <view width={ring() ? ring().w : 0} height={55} borderRadius={r(27.5)} color={NONE} border={{ width: 3, color: hex(look().focus) }} />
      </view>
      <view>
        <Index each={placed()}>
          {(tab) => (
            <text
              fontFamily={uiFont(tab().on ? 'bold' : 'medium')}
              fontSize={19}
              x={tab().x + 25}
              y={4 + lineY(3 + (49 - 26.6) / 2, 26.6, 19)}
              color={tab().on ? look().onAccent : look().os(0.75)}
            >
              {tab().label}
            </text>
          )}
        </Index>
      </view>
      <view
        width={barW()}
        height={63}
        pointerItems={() => (props.onPointerTab ? placed().map((tab) => ({ x: tab.x, y: 4, w: tab.w, h: 55 })) : [])}
        onPointerItem={(_, i) => props.onPointerTab(i)}
        onPointerItemClick={props.onPointerTabClick ? (_, i) => props.onPointerTabClick(i) : undefined}
      />
    </view>
  )
}
