import { For } from 'solid-js'
import { hex } from '../../../color.js'
import { shadowColor } from '../../../theme.js'
import { keyed } from '../../library/pageKit.js'
import { rowUiFont } from '../rowFont.js'
import { COLUMN_W } from '../layoutRows.js'

// The achievement screens' tab bar: a full width track, the open tab filled with the accent and
// the focused one ringed, clipped to the bar when it scrolls. [m] is the block from build.tabBar.
const GLOW = { color: shadowColor('#ffffff40'), x: 0, y: 0, blur: 14, spread: 1 }
const DROP = { color: shadowColor('#00000059'), x: 0, y: 8, blur: 18, spread: 0 }

export default function SocialTabs(props) {
  const pills = keyed(() => props.m.pills || [], (pl) => pl.k)
  const p = () => props.p
  return (
    <view width={COLUMN_W} height={83} borderRadius={41.5} color={p().os(0.08)} clipping>
      <For each={pills.keys()}>
        {(k) => {
          const pl = pills.item(k)
          const on = () => pl().sid === props.focusSid
          return (
            <view x={pl().x} y={12} width={pl().w} height={55}>
              <view width={pl().w} height={55} borderRadius={27.5} color="#00000000" shadow={DROP} alpha={on() ? 1 : 0} />
              <view width={pl().w} height={55} borderRadius={27.5} color="#00000000" shadow={GLOW} alpha={on() ? 1 : 0} />
              <view width={pl().w} height={55} borderRadius={27.5} color={pl().on ? p().accent : '#00000000'} />
              <text
                fontFamily={rowUiFont(pl().on ? 'bold' : 'medium')}
                fontSize={19}
                lineHeight={26.6}
                x={25}
                y={15.82}
                color={pl().on ? p().onAccent : p().os(0.75)}
              >
                {pl().label || ' '}
              </text>
              <view width={pl().w} height={55} borderRadius={27.5} color="#00000000" border={{ width: 3, color: hex(p().t.focus) }} alpha={on() ? 1 : 0} />
            </view>
          )
        }}
      </For>
    </view>
  )
}
