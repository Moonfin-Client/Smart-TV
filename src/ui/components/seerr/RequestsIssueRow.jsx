import { Show } from 'solid-js'
import { highMs } from '../../tier.js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'
import { tx } from '../../fx.js'

// One row of the issues list, 1644 by 168: the title's art, its type, scope and reply count beside
// the status chip, who reported it, and Resolve or Reopen at the right for a moderator or the
// reporter. Purely visual. `focusAt` is the index of the focused row and `subAt` is 1 when its
// button has focus. The art is a 360 by 240 image the row cuts off, and there's no title line.
const COVER = { resizeMode: { type: 'cover' } }

export default function RequestsIssueRow(props) {
  const r = () => props.row
  const focused = () => !!r() && r().idx === props.focusAt
  const on = () => focused() && !props.subAt
  const btnOn = () => focused() && props.subAt === 1
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={1644}
      height={168}
      pivot={0.5}
      transition={tx({ scale: { duration: highMs(200), easing: 'ease' } })}
      scale={on() ? 1.02 : 1}
    >
      <view x={-4} y={-4} width={1652} height={176} borderRadius={12} color="#00000000" border={{ width: 4, color: hex(theme().focus) }} alpha={on() ? 1 : 0} />
      <view width={1644} height={168} borderRadius={8} color={on() ? '#ffffff26' : '#ffffff0d'} />
      <view width={1644} height={168} clipping>
        <Show when={r().image}>
          <view x={48} y={-36} width={360} height={240} borderRadius={4} src={r().image} textureOptions={COVER} />
        </Show>
      </view>
      <text x={456} y={73} fontFamily={r().metaFont} fontSize={21.6} lineHeight={33} color="#e6e6e6b3">
        {r().meta}
      </text>
      <view x={480 + r().metaW} y={66} width={r().chip.w} height={43} borderRadius={6} color={r().chip.fill} border={{ width: 1, color: hex(r().chip.border) }}>
        <text x={13} y={6.5} fontFamily={r().chip.font} fontSize={18} letterSpacing={0.4} lineHeight={33} color={r().chip.ink}>
          {r().chip.text}
        </text>
      </view>
      <text x={474} y={r().byY} fontFamily={r().byFont} fontSize={30} lineHeight={33} maxWidth={972} maxLines={1} color="#e6e6e699">
        {r().by}
      </text>
      <view>
        <Show when={r().toggle[0]}>
          {(tg) => (
            <view
              x={tg().x}
              y={54.5}
              width={tg().w}
              height={59}
              pivot={0.5}
              transition={{ scale: { duration: 120, easing: 'ease' } }}
              scale={btnOn() ? 1.05 : 1}
            >
              <view width={tg().w} height={59} borderRadius={8} color={tg().fill} />
              <view width={tg().w} height={59} borderRadius={8} color="#00000000" border={{ width: 3, color: hex(theme().focus) }} alpha={btnOn() ? 1 : 0} />
              <text x={25} y={15} fontFamily={r().btnFont} fontSize={22.8} lineHeight={33} color={tg().ink}>
                {tg().label}
              </text>
            </view>
          )}
        </Show>
      </view>
    </view>
  )
}
