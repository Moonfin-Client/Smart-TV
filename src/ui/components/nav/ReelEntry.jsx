import { Show, createMemo } from 'solid-js'
import { theme } from '../../theme.js'
import { faceDy } from '../../text.js'
import { reelSlot } from './reelMath.js'
import { tx } from '../../fx.js'

// One entry on the Reel wheel, placed and scaled by `slot`, its distance from the window. `jump`
// skips the slide when an entry wraps from one end of the wheel to the other. The transition comes
// before the props it times, so a jump lands in the same update that moves the entry.
export default function ReelEntry(props) {
  const place = createMemo(() => reelSlot(props.slot))
  const move = () => ({ duration: props.jump ? 0 : 250 })
  return (
    <view
      width={900}
      height={90}
      pointerRing={props.onPointerClick ? true : undefined}
      onPointerClick={props.onPointerClick}
      pivotX={0}
      pivotY={0.5}
      transition={tx({ x: move(), y: move(), scale: move(), alpha: move() })}
      x={place().x}
      y={495 + place().y}
      scale={place().s}
      alpha={place().a}
    >
      <view y={19.5} width={51} height={51} src={props.entry.icon} color="#ffffffff" />
      <text
        fontFamily={props.entry.font}
        fontSize={48}
        x={75}
        y={25.5 + faceDy(48, true)}
        lineHeight={1}
        letterSpacing={-0.72}
        color="#ffffffff"
      >
        {props.entry.label}
      </text>
      <view>
        <Show when={props.entry.current}>
          <view x={75 + props.entry.labelW + 18} y={38} width={14} height={14} borderRadius={7} color={theme().accent} />
        </Show>
      </view>
    </view>
  )
}
