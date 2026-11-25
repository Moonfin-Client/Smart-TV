import { For, Show, createMemo } from 'solid-js'
import { uiFont, faceDy, themeSpacing } from '../../text.js'
import { theme, glowShadow } from '../../theme.js'
import { tx } from '../../fx.js'
import { badgeWidth } from './navEntries.js'

// One button of the classic top bar, or a library under the open Libraries pill. `item` holds plain
// values from TopBar's items.
export default function TopBarPill(props) {
  const t = createMemo(() => theme())
  const lib = () => props.item.kind === 'lib'
  // Pixel themes square off the nav's pills and buttons.
  const r = () => (t().isPixel ? 0 : 36)
  const h = () => (lib() ? 58 : 70)
  const size = () => (lib() ? 20 : 22)
  const glows = createMemo(() => t().focusGlow.map(glowShadow))
  const ink = () => (props.focused ? t().navFocusInk : props.item.active ? t().onSurface : props.item.rest)
  const iconX = () => (props.expanded ? 24 : 18)
  const badgeW = () => badgeWidth(props.item.badge)
  const fx = () => ({ duration: props.fx })
  return (
    <view
      ref={props.ref}
      x={props.x}
      y={props.y}
      width={props.w}
      height={h()}
      alpha={props.hiddenLib ? 0 : 1}
      transition={tx({ x: fx(), width: fx(), alpha: { duration: props.listMs } })}
    >
      <view>
        <For each={glows()}>
          {(g) => (
            <view
              width={props.w}
              height={h()}
              borderRadius={r()}
              color="#00000000"
              shadow={g.shadow}
              alpha={props.focused ? 1 : 0}
              transition={tx({ width: fx(), alpha: fx() })}
            />
          )}
        </For>
      </view>
      <view
        width={props.w}
        height={h()}
        borderRadius={r()}
        color={t().navActiveTop}
        alpha={props.item.active ? 1 : 0}
        transition={tx({ width: fx() })}
      />
      <view
        width={props.w}
        height={h()}
        borderRadius={r()}
        color={t().navFocusFill}
        alpha={props.focused ? 1 : 0}
        transition={tx({ width: fx(), alpha: fx() })}
      />
      <view
        x={iconX()}
        y={17}
        width={36}
        height={36}
        src={props.item.icon || undefined}
        alpha={props.item.icon ? 1 : 0}
        color={ink()}
        transition={tx({ x: fx(), color: fx() })}
      />
      <view>
        <Show when={props.item.badge}>
          <view x={iconX() + 46 - badgeW()} y={11} width={badgeW()} height={22} borderRadius={11} color="#e03b36ff">
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
              {props.item.badge}
            </text>
          </view>
        </Show>
      </view>
      <text
        letterSpacing={themeSpacing()}
        fontFamily={props.item.font}
        fontSize={size()}
        x={lib() ? 20 : 70}
        y={(lib() ? 21 : 25.5) + faceDy(size(), true)}
        lineHeight={1}
        color={ink()}
        alpha={props.expanded || lib() ? 1 : 0}
        transition={tx({ color: fx() })}
      >
        {props.item.label}
      </text>
    </view>
  )
}
