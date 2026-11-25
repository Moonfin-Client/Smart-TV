import { For } from 'solid-js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { tx } from '../../fx.js'

// One side of a card's poster labels (cardMarks.labelSets): the pills, then their icons and flags,
// then their text, each kind in its own list so it draws as one batch. `nodes` is labelNodes().
const PILL_SHADOW = { color: shadowColor('#0000002d'), x: 0, y: 2, blur: 7, spread: 0 }

export default function LabelSet(props) {
  return (
    <view x={props.x || 0} y={props.y || 0} width={props.w} height={props.h} transition={tx(props.transition)}>
      <view>
        <For each={props.nodes.pills}>
          {(p) => (
            <view
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              borderRadius={p.r}
              color={p.fill}
              border={p.bw ? { width: p.bw, color: hex(p.bc) } : undefined}
              shadow={PILL_SHADOW}
            />
          )}
        </For>
      </view>
      <view>
        <For each={props.nodes.art}>
          {(a) => (
            <view
              x={a.x}
              y={a.y}
              width={a.w}
              height={a.h}
              borderRadius={a.r}
              src={a.src}
              color={a.ink}
              border={a.bw ? { width: a.bw, color: hex(a.bc) } : undefined}
            />
          )}
        </For>
      </view>
      <view>
        <For each={props.nodes.texts}>
          {(t) => (
            <text x={t.x} y={t.y} fontFamily={t.font} fontSize={t.size} lineHeight={t.lh} letterSpacing={0.8} maxWidth={t.max} maxLines={1} color={t.ink}>
              {t.text}
            </text>
          )}
        </For>
      </view>
    </view>
  )
}
