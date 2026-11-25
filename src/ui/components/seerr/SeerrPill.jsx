import { Show } from 'solid-js'
import { highMs } from '../../tier.js'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'
import { textWidth } from './look.js'
import { tx } from '../../fx.js'

// The rounded pill at the top right of Discover for Search and Requests, with the waiting count
// beside Requests. Purely visual, the holder passes `focused`.
export const pillWidth = (label, badge) =>
  Math.round(textWidth(label, 23) + 91 + (badge > 0 ? 13 + textWidth(String(badge), 19, 'bold') + 20 : 0))

const EDGE = { width: 1, color: hex('#ffffff3d') }

export default function SeerrPill(props) {
  const t = () => theme()
  const font = uiFont()
  const badgeFont = uiFont('bold')
  const w = () => pillWidth(props.label, props.badge)
  const badgeText = () => String(props.badge)
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={w()}
      height={60}
      pivot={0.5}
      transition={tx({ scale: { duration: highMs(120), easing: 'ease' } })}
      scale={props.focused ? 1.05 : 1}
    >
      <view width={w()} height={60} borderRadius={30} color="#1a1a1acc" border={EDGE} />
      <view
        width={w()}
        height={60}
        borderRadius={30}
        color="#00000000"
        border={{ width: 3, color: hex(props.ring || t().focus) }}
        alpha={props.focused ? 1 : 0}
      />
      <view x={24} y={15} width={30} height={30} src={'icons/' + props.icon + '.webp'} color="#ffffffb3" />
      <text x={67} y={15} fontFamily={font} fontSize={23} lineHeight={30} color="#ffffffff">
        {props.label}
      </text>
      <view>
        <Show when={props.badge > 0}>
          <view x={80 + textWidth(props.label, 23)} y={15} width={textWidth(badgeText(), 19, 'bold') + 20} height={27} borderRadius={13.5} color={t().accent}>
            <text x={10} y={2} fontFamily={badgeFont} fontSize={19} lineHeight={22.8} color={t().onAccent}>
              {badgeText()}
            </text>
          </view>
        </Show>
      </view>
    </view>
  )
}
