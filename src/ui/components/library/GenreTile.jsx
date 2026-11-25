import { Show } from 'solid-js'
import { hex } from '../../color.js'
import { tx } from '../../fx.js'

// `opts.glow` is Neon Pulse's focus glow around the card.
const RING = { width: 3, color: hex('#ffffff') }
const COVER = { resizeMode: { type: 'cover' } }

export default function GenreTile(props) {
  const o = () => props.opts || {}
  const c = () => props.card || {}
  const nameY = () => (c().countText ? (o().cardH - 70) / 2 : (o().cardH - 33) / 2)
  const ease = () => ({ duration: o().ms || 0, easing: 'ease' })
  return (
    <view x={10} y={10} width={o().cardW} height={o().cardH} pivot={0.5} scale={props.focused ? 1.05 : 1} transition={tx({ scale: ease() })}>
      <view>
        <Show when={o().glow}>
          <view width={o().cardW} height={o().cardH} borderRadius={12} color="#00000000" shadow={o().glow} alpha={props.focused ? 1 : 0} transition={tx({ alpha: ease() })} />
        </Show>
      </view>
      <view>
        <Show
          when={c().image}
          fallback={<view width={o().cardW} height={o().cardH} colorTl="#1a1a2e" colorTr="#151520" colorBl="#151520" colorBr="#151520" />}
        >
          <view width={o().cardW} height={o().cardH} src={c().image} textureOptions={COVER} />
        </Show>
      </view>
      <view width={o().cardW} height={o().cardH} color={props.focused ? '#0000001a' : '#00000066'} />
      <view
        width={o().cardW}
        height={o().cardH}
        borderRadius={12}
        color="#00000000"
        border={o().ring || RING}
        alpha={props.focused ? 1 : 0}
        transition={tx({ alpha: { duration: o().ms || 0 } })}
      />
      <text fontFamily={c().nameFont} fontSize={22} x={o().cardW / 2} y={nameY()} lineHeight={33} mountX={0.5} letterSpacing={o().nameSpacing || 0} color={o().nameColor || '#ffffff'} textShadow={o().nameShadow}>
        {c().name || ''}
      </text>
      <view>
        <Show when={c().countText}>
          <text fontFamily={o().countFont} fontSize={14} x={o().cardW / 2} y={nameY() + 37} lineHeight={33} mountX={0.5} color={o().countColor || '#ffffffcc'}>
            {c().countText}
          </text>
        </Show>
      </view>
    </view>
  )
}
