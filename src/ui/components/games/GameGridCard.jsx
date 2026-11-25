import { createEffect, createSignal, on } from 'solid-js'

// One cover in a game system's grid. Art the grid's shape doesn't fit shows whole over the seeded
// color, with no blurred copy behind it. Props: `card`, `focused`, `w`, `coverH`, `neon`, `x`, `y`.
const COVER = { resizeMode: { type: 'cover' } }
const CONTAIN = { resizeMode: { type: 'contain' } }
const TITLE_SHADOW = { color: '#0000008a', x: 0, y: 0, blur: 4 }

export default function GameGridCard(props) {
  const [failed, setFailed] = createSignal(false)
  const c = () => props.card
  createEffect(on(() => c().image, () => setFailed(false), { defer: true }))
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={props.w}
      height={c().innerH}
      pivot={0.5}
      scale={props.focused ? 1.05 : 1}
      transition={{ scale: { duration: 200, easing: 'ease' } }}
    >
      <view width={props.w} height={props.coverH} borderRadius={12} color={props.focused ? (props.neon ? '#ff2e92' : '#ffffff') : c().bg} />
      <view x={3} y={3} width={props.w - 6} height={props.coverH - 6} borderRadius={9} color={c().bg} />
      <view
        x={3}
        y={3}
        width={props.w - 6}
        height={props.coverH - 6}
        borderRadius={9}
        src={c().image || ''}
        alpha={c().image && !failed() ? 1 : 0}
        textureOptions={c().contain ? CONTAIN : COVER}
        onEvent={{ failed: () => setFailed(true) }}
      />
      <text
        y={props.coverH + 7.5}
        fontFamily={c().titleFont}
        fontSize={19}
        lineHeight={22.8}
        maxWidth={props.w}
        maxLines={2}
        textShadow={TITLE_SHADOW}
        color={props.focused ? '#ffffff' : props.neon ? '#00e5ff' : '#ffffffbf'}
      >
        {c().title}
      </text>
    </view>
  )
}
