import { Show } from 'solid-js'
import { uiFont, faceDy, themeSpacing } from '../../text.js'
import { theme } from '../../theme.js'
import { badgeWidth } from './navEntries.js'

// One tab of the Atlas bar. `tab` holds plain values from Atlas's tabs.
export default function AtlasTab(props) {
  const color = () => (props.focused || props.opened || props.tab.current ? '#ffffffff' : '#ffffffb8')
  const badgeW = () => badgeWidth(props.tab.badge)
  return (
    <view ref={props.ref} x={props.x} width={props.w} height={96}>
      <view width={props.w} height={96} borderRadius={[21, 21, 0, 0]} color="#1b1f26ff" alpha={props.opened ? 1 : 0} />
      <view x={27} y={33} width={30} height={30} src={props.tab.icon} color={color()} />
      <view>
        <Show when={props.tab.badge}>
          <view x={67 - badgeW()} y={27} width={badgeW()} height={22} borderRadius={11} color="#e03b36ff">
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
      <text
        letterSpacing={themeSpacing()}
        fontFamily={props.opened ? props.tab.boldFont : props.tab.font}
        fontSize={22}
        x={69}
        y={39 + faceDy(22, true)}
        lineHeight={1}
        color={color()}
      >
        {props.tab.label}
      </text>
      <view>
        <Show when={props.tab.chevron}>
          <view
            x={props.w - 51}
            y={36}
            width={24}
            height={24}
            src={props.opened ? 'icons/nav_chevron_up.webp' : 'icons/nav_chevron_down.webp'}
            color={props.opened ? theme().accent : color()}
            alpha={props.opened ? 1 : 0.6}
          />
        </Show>
      </view>
      <view x={27} y={92} width={props.w - 54} height={4} borderRadius={2} color="#ffffffff" alpha={props.focused ? 1 : 0} />
    </view>
  )
}
