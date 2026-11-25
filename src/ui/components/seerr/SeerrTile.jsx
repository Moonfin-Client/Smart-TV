import { Show } from 'solid-js'
import { highMs } from '../../tier.js'
import { hex } from '../../color.js'
import { tx } from '../../fx.js'

// Discover's tiles, 180 by 90 point cards: a shortcut's still with its icon and name, a
// genre's duotone still with its name across it, or a studio's or network's logo. Purely visual,
// the holder passes `focused`.
// tile: { kind: 'shortcut' | 'genre' | 'logo', art, icon, name, nameFont, nameScale, logo, inset }
const COVER = { resizeMode: { type: 'cover' } }
const CONTAIN = { resizeMode: { type: 'contain' } }

export default function SeerrTile(props) {
  const t = () => props.tile || {}
  return (
    <view
      x={props.x || 0}
      width={props.w}
      height={props.h}
      pivot={0.5}
      transition={tx({ scale: { duration: highMs(150), easing: 'ease' } })}
      scale={props.focused ? 1.05 : 1}
    >
      <view width={props.w} height={props.h} borderRadius={13} color={t().kind === 'logo' ? '#1a1a1aff' : '#262626ff'} />
      <Show when={t().art}>
        <view width={props.w} height={props.h} borderRadius={13} src={t().art} textureOptions={COVER} />
      </Show>
      <Show when={t().kind === 'shortcut'}>
        <view width={props.w} height={props.h}>
          <view width={props.w} height={props.h} borderRadius={13} colorTop="#00000000" colorBottom="#000000ba" />
          <view x={13} y={props.h - 13 - 28.5} width={27} height={27} src={'icons/' + t().icon + '.webp'} color="#ffffffff" />
          <text
            x={50}
            y={props.h - 13 - 30}
            fontFamily={t().nameFont}
            fontSize={23}
            lineHeight={30}
            maxWidth={props.w - 63}
            maxLines={1}
            color="#ffffffff"
          >
            {t().name}
          </text>
        </view>
      </Show>
      <Show when={t().kind === 'genre'}>
        <view width={props.w} height={props.h} borderRadius={13} color="#0000004d">
          <text
            x={props.w / 2}
            y={props.h / 2}
            mountX={0.5}
            mountY={0.5}
            scale={t().nameScale}
            fontFamily={t().nameFont}
            fontSize={23}
            lineHeight={30}
            letterSpacing={4.2}
            color="#ffffffe6"
          >
            {t().name}
          </text>
        </view>
      </Show>
      <Show when={t().kind === 'logo'}>
        <view x={t().inset} y={t().inset} width={props.w - 2 * t().inset} height={props.h - 2 * t().inset} src={t().logo} textureOptions={CONTAIN} />
      </Show>
      <view
        width={props.w}
        height={props.h}
        borderRadius={13}
        color="#00000000"
        border={{ width: 3, color: hex(props.ring || '#00a4dcff') }}
        alpha={props.focused ? 1 : 0}
      />
    </view>
  )
}
