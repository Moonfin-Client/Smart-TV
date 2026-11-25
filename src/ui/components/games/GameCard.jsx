import { Show, createEffect, createSignal, on } from 'solid-js'

// Box art on the surface color, or the game's seeded color with a gamepad glyph when the server has
// no art. `card` comes from gameModels.relatedCard. Props: `card`, `focused`, `ring` (the focus
// color), `x`, `y`.
const COVER = { resizeMode: { type: 'cover' } }
const CONTAIN = { resizeMode: { type: 'contain' } }

export default function GameCard(props) {
  const [failed, setFailed] = createSignal(false)
  const c = () => props.card
  createEffect(on(c, () => setFailed(false), { defer: true }))
  const art = () => !!c().image && !failed()
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={c().w}
      height={c().h}
      pivot={0.5}
      scale={props.focused ? 1.06 : 1}
      transition={{ scale: { duration: 120, easing: 'ease' } }}
    >
      <view x={-4} y={c().top - 4} width={c().w + 8} height={c().posterH + 8} borderRadius={16} color={props.ring || '#00a4dcff'} alpha={props.focused ? 1 : 0} />
      <view y={c().top} width={c().w} height={c().posterH} borderRadius={12} color={art() ? '#1c1c1cff' : c().bg} />
      <view>
        <Show
          when={art()}
          fallback={
            <view
              x={c().w * 0.3}
              y={c().top + c().posterH * 0.5 - c().w * 0.2}
              width={c().w * 0.4}
              height={c().w * 0.4}
              src="icons/game_glyph.webp"
              color="#ffffffb3"
            />
          }
        >
          <view
            y={c().top}
            width={c().w}
            height={c().posterH}
            borderRadius={12}
            src={c().image}
            textureOptions={c().contain ? CONTAIN : COVER}
            onEvent={{ failed: () => setFailed(true) }}
          />
        </Show>
      </view>
      <text
        y={c().h - c().titleH + 9}
        fontFamily={c().titleFont}
        fontSize={22}
        lineHeight={26.4}
        maxWidth={c().w}
        maxLines={c().maxLines || 2}
        color={props.focused ? '#ffffffff' : '#cfd6e0ff'}
      >
        {c().title}
      </text>
    </view>
  )
}
