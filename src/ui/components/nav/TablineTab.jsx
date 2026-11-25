import { Show } from 'solid-js'
import { uiFont, faceDy, themeSpacing } from '../../text.js'
import { theme } from '../../theme.js'
import { tx } from '../../fx.js'
import { badgeWidth } from './navEntries.js'

const GLOW = { color: '#ffffff73', x: 0, y: 0, blur: 27 }

// One tab of the Tabline bar. `tab` holds plain values from Tabline's tabs.
export default function TablineTab(props) {
  const bold = () => props.focused || props.tab.current
  const lineColor = () => {
    if (props.focused) return '#ffffffff'
    return props.tab.current ? props.accent || theme().accent : '#00000000'
  }
  const badgeW = () => badgeWidth(props.tab.badge)
  return (
    <view
      ref={props.ref}
      x={props.x}
      width={props.w}
      height={72}
      pivot={0.5}
      scale={props.focused ? 1.12 : 1}
      alpha={props.hiddenLib ? 0 : 1}
      transition={tx({ x: { duration: props.fx }, scale: { duration: props.fx } })}
    >
      <text
        letterSpacing={themeSpacing()}
        fontFamily={bold() ? props.tab.boldFont : props.tab.font}
        fontSize={24}
        y={26 + faceDy(24, true)}
        lineHeight={1}
        color={bold() ? '#ffffffff' : '#ffffffad'}
        textShadow={props.focused ? GLOW : null}
      >
        {props.tab.label}
      </text>
      <view
        x={props.focused ? -9 : 0}
        y={props.focused ? 62 : 59}
        width={props.focused ? props.w + 18 : props.w}
        height={4}
        borderRadius={3}
        color={lineColor()}
      />
      <view>
        <Show when={props.tab.badge}>
          <view x={props.w + 10 - badgeW()} y={16} width={badgeW()} height={22} borderRadius={11} color="#e03b36ff">
            <text
              letterSpacing={themeSpacing()}
              fontFamily={uiFont('bold')}
              fontSize={14}
              x={badgeW() / 2}
              y={faceDy(14)}
              mountX={0.5}
              lineHeight={22}
              color="#ffffffff"
            >
              {props.tab.badge}
            </text>
          </view>
        </Show>
      </view>
    </view>
  )
}
