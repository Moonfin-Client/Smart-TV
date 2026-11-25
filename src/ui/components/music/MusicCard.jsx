import { For, Show, createMemo } from 'solid-js'
import { glowShadow, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import * as settings from '../../../state/settings.js'

const NONE = '#00000000'
const DEFAULT_GLOW = [{ color: '#00000099', x: 0, y: 8, blur: 24, spread: 0 }]
const BADGE_SHADOW = { color: shadowColor('#00000099'), x: 0, y: 1.5, blur: 4, spread: 0 }
const COVER = { resizeMode: { type: 'cover' } }

export default function MusicCard(props) {
  const look = () => props.look
  const grow = () => !!settings.get('cardFocusZoom')
  const radius = () => (props.card.circle ? props.size / 2 : look().cardRadius)
  const glows = createMemo(() => {
    if (!props.focused) return []
    const list = look().glow && look().glow.length ? look().glow : DEFAULT_GLOW
    return list.map((g, i) => glowShadow(g, i))
  })
  const border = () => look().cardBorder
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={props.size}
      height={props.size + 86}
      pivot={0.5}
      transition={{ scale: { duration: 150, easing: 'ease-out' } }}
      scale={grow() && props.focused ? 1.05 : 1}
    >
      <view>
        <For each={glows()}>
          {(g) => <view width={props.size} height={props.size} borderRadius={radius()} color={NONE} shadow={g.shadow} />}
        </For>
      </view>
      <view>
        <Show when={!props.card.image}>
          <view width={props.size} height={props.size} borderRadius={radius()} color={look().surfaceVariant}>
            <view width={props.size} height={props.size} borderRadius={radius()} colorTop={look().accentA(0.2)} colorBottom={look().accentA(0.02)} />
            <text
              fontFamily={props.card.placeholderFont}
              fontSize={20}
              letterSpacing={3}
              lineHeight={26}
              maxLines={4}
              x={props.size / 2}
              y={props.size / 2}
              mountX={0.5}
              mountY={0.5}
              maxWidth={props.size - 24 - 2 * border().w}
              contain="width"
              textAlign="center"
              color={look().onSurface}
              alpha={0.5}
            >
              {props.card.placeholder}
            </text>
          </view>
        </Show>
      </view>
      <view>
        <Show when={props.card.image}>
          <view width={props.size} height={props.size} borderRadius={radius()} src={props.card.image} textureOptions={COVER} />
        </Show>
      </view>
      <view
        width={props.size}
        height={props.size}
        borderRadius={radius()}
        color={NONE}
        border={{ width: border().w, color: hex(border().color) }}
        alpha={border().w ? 1 : 0}
      />
      <view>
        <Show when={props.focused}>
          <view width={props.size} height={props.size} borderRadius={radius()} color={NONE} border={{ width: 4, color: hex(look().focus) }} />
        </Show>
      </view>
      <view>
        <Show when={props.card.fav}>
          <view x={8} y={8} width={28} height={28} borderRadius={14} color={look().favBadge} border={{ width: 1, color: hex(look().onBadge) }} shadow={BADGE_SHADOW}>
            <view x={7} y={7} width={14} height={14} src="icons/mus_heart.webp" color={look().onBadge} />
          </view>
        </Show>
      </view>
      <view>
        <Show when={props.card.played}>
          <view x={props.size - 34} y={8} width={26} height={26} borderRadius={13} color={look().t.badgeWatched} border={{ width: 1, color: hex(look().onBadge) }}>
            <view x={5.5} y={5.5} width={15} height={15} src="icons/watched_check.webp" color={look().onBadge} />
          </view>
        </Show>
      </view>
      <text
        fontFamily={props.card.titleFont}
        fontSize={20}
        y={props.size + 10 + 5.8}
        maxWidth={props.size}
        contain="width"
        textAlign="center"
        maxLines={1}
        color={look().onSurface}
      >
        {props.card.title}
      </text>
      <view>
        <Show when={props.card.subtitle}>
          <text
            fontFamily={props.card.subtitleFont}
            fontSize={16}
            y={props.size + 43 + 7.1}
            maxWidth={props.size}
            contain="width"
            textAlign="center"
            maxLines={1}
            color={look().os(0.6)}
          >
            {props.card.subtitle}
          </text>
        </Show>
      </view>
    </view>
  )
}
