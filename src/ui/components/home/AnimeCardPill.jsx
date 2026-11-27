import { Show, createMemo } from 'solid-js'
import { markerPills } from '../player/animePills.js'
import { cssShift, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'

// The anime pill over a card's art: the first of its marker's pills at the compact size (13px, 1 by
// 9 padding, a 1px border) on a dark fill, 8px in from the left and `bottom` up from the art's foot.
// Props: `anime` ({ marker, audio } from cardMarks), `w` and `h` (the art), `bottom`.
const LINE = 13 * 1.5
const H = LINE + 2 + 2
const SHADOW = { color: shadowColor('#00000080'), x: 0, y: 1, blur: 3, spread: 0 }

export default function AnimeCardPill(props) {
  const pill = createMemo(() => {
    const a = props.anime
    const p = a ? markerPills(a.marker, a.audio, true)[0] : null
    if (!p) return null
    const w = Math.min(p.w, props.w - 16)
    return { ...p, w, y: props.h - props.bottom - H, font: fontFor(p.label, 'bold') }
  })
  return (
    <Show when={pill()}>
      {(p) => (
        <view x={8} y={p().y} width={p().w} height={H}>
          <view width={p().w} height={H} borderRadius={8} color="#00000000" shadow={SHADOW} />
          <view width={p().w} height={H} borderRadius={8} color="#000000b8" border={{ width: 1, color: hex(p().border) }} />
          <text
            x={10}
            y={2 + (LINE - 33) / 2 + cssShift(13)}
            fontFamily={p().font}
            fontSize={13}
            lineHeight={33}
            letterSpacing={0.2}
            maxWidth={p().w - 20}
            maxLines={1}
            color={p().text}
          >
            {p().label}
          </text>
        </view>
      )}
    </Show>
  )
}
