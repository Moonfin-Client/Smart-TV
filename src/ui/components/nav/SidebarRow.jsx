import { For, Show, createMemo } from 'solid-js'
import { uiFont, faceDy, themeSpacing } from '../../text.js'
import { theme, glowShadow } from '../../theme.js'
import { tx } from '../../fx.js'
import { badgeWidth } from './navEntries.js'

// One row of the classic sidebar, or a library under the open Libraries toggle. `row` comes from
// Sidebar's rows.
export default function SidebarRow(props) {
  const t = createMemo(() => theme())
  const lib = () => props.row.kind === 'lib'
  // Pixel themes square off the nav's pills and buttons.
  const radius = () => (t().isPixel ? 0 : lib() ? 24 : 28)
  const glows = createMemo(() => t().focusGlow.map(glowShadow))
  const ink = () => (props.focused ? t().navFocusInk : props.row.active ? t().onSurface : props.row.rest)
  const badgeW = () => badgeWidth(props.row.badge)
  const fx = () => ({ duration: props.fx })
  const grow = () => ({ duration: props.widthMs })
  return (
    <view
      ref={props.ref}
      x={props.x}
      y={props.y}
      width={props.w}
      height={props.row.h}
      transition={tx({ y: { duration: props.slideMs }, width: grow() })}
    >
      <view>
        <For each={glows()}>
          {(g) => (
            <view
              width={props.w}
              height={props.row.h}
              borderRadius={radius()}
              color="#00000000"
              shadow={g.shadow}
              alpha={props.focused ? 1 : 0}
              transition={tx({ width: grow(), alpha: fx() })}
            />
          )}
        </For>
      </view>
      <view
        width={props.w}
        height={props.row.h}
        borderRadius={radius()}
        color={t().navActiveSide}
        alpha={props.row.active ? 1 : 0}
        transition={tx({ width: grow() })}
      />
      <view
        width={props.w}
        height={props.row.h}
        borderRadius={radius()}
        color={t().navFocusFill}
        alpha={props.focused ? 1 : 0}
        transition={tx({ width: grow(), alpha: fx() })}
      />
      <view
        x={15}
        y={15}
        width={38}
        height={38}
        src={props.row.icon || undefined}
        alpha={props.row.icon ? 1 : 0}
        color={ink()}
        transition={tx({ color: fx() })}
      />
      <view>
        <Show when={props.row.badge}>
          <view x={63 - badgeW() + 10} y={9} width={badgeW()} height={22} borderRadius={11} color="#e03b36ff">
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
              {props.row.badge}
            </text>
          </view>
        </Show>
      </view>
      <text
        letterSpacing={themeSpacing()}
        fontFamily={props.row.font}
        fontSize={20}
        x={lib() ? 65 : 67}
        y={(lib() ? 17 : 26) + faceDy(20, true)}
        lineHeight={1}
        maxWidth={lib() ? 180 : props.row.toggle ? 144 : 178}
        maxLines={1}
        color={ink()}
        alpha={props.open ? 1 : 0}
        transition={tx({ color: fx(), alpha: { duration: 150 } })}
      >
        {props.row.label}
      </text>
      <view>
        <Show when={props.row.toggle}>
          <view
            x={props.w - 35}
            y={24}
            width={20}
            height={20}
            src="icons/nav_chevron_down.webp"
            pivot={0.5}
            rotation={props.libsOpen ? Math.PI : 0}
            alpha={props.open ? 0.5 : 0}
            color={ink()}
            transition={tx({ x: grow(), rotation: { duration: props.turnMs }, alpha: { duration: 150 } })}
          />
        </Show>
      </view>
    </view>
  )
}
