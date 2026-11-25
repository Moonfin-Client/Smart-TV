import { cssShift, themeSpacing } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { shadowColor } from '../../../ui/theme.js'
import StillLabels from '../../../ui/components/details/StillLabels.jsx'

// One episode in Minimalist's rail. `large` is the same card at Stage's size and `wide` a large one
// with room for a bigger title.
export const cardMetrics = (large, wide) => (large
  ? { r: 23, ring: 5, num: 28, numPad: 18, numPadY: 2, inset: 13, badge: 37, tick: 22, title: wide ? 30 : 25, titleTop: 13 }
  : { r: 14, ring: 3, num: 17, numPad: 11, numPadY: 1, inset: 8, badge: 22, tick: 13, title: 18, titleTop: 8 })

const COVER = { resizeMode: { type: 'cover' } }
const TITLE_SHADOW = { color: '#000000eb', x: 0, y: 2, blur: 8 }
const BADGE_SHADOW = { color: shadowColor('#00000099'), x: 0, y: 1.5, blur: 4, spread: 0 }
const WHITE = hex('#ffffffff')
// The current episode's ring keeps this blue on every theme.
const CURRENT = hex('#00a4dcb3')
const DEFAULT_TOKENS = { badgeWatched: '#00a4dce6', onBadge: '#ffffffff' }

export default function EpisodeCard(props) {
  const t = () => props.tokens || DEFAULT_TOKENS
  const m = () => props.m
  const c = () => props.card
  const numH = () => 33 + m().numPadY * 2
  const numW = () => (c().numW || 0) + m().numPad * 2
  const large = () => m().inset > 8
  const edge = () => (large() ? 13 : 8)
  return (
    <view x={props.x || 0} width={props.w} height={props.ih}>
      <view width={props.w} height={props.ih} borderRadius={m().r} color="#ffffff1a" />
      <view alpha={c().img ? 1 : 0} width={props.w} height={props.ih} borderRadius={m().r} src={c().img || undefined} textureOptions={COVER} />
      <view
        alpha={c().num != null ? 1 : 0}
        x={m().inset}
        y={props.ih - m().inset - numH()}
        width={numW()}
        height={numH()}
        borderRadius={m().r}
        color="#000000c7"
      >
        <text x={m().numPad} y={m().numPadY + cssShift(m().num)} fontFamily={c().numFont} fontSize={m().num} lineHeight={33} letterSpacing={themeSpacing()} color="#ffffffff">
          {c().numText}
        </text>
      </view>
      <view alpha={c().played ? 1 : 0} x={props.w - m().inset - m().badge} y={m().inset} width={m().badge} height={m().badge}>
        <view width={m().badge} height={m().badge} borderRadius={m().badge / 2} color="#00000000" shadow={BADGE_SHADOW} />
        <view
          width={m().badge}
          height={m().badge}
          borderRadius={m().badge / 2}
          color={t().badgeWatched}
          border={{ width: 1.5, color: hex(t().onBadge) }}
        />
        <view
          x={(m().badge - m().tick) / 2}
          y={(m().badge - m().tick) / 2}
          width={m().tick}
          height={m().tick}
          src="icons/d/watched.webp"
          color={t().onBadge}
        />
      </view>
      <StillLabels
        w={props.w}
        h={props.ih}
        item={c().item}
        inset={edge()}
        top={edge()}
        topRight={c().played ? (large() ? 56 : 36) : edge()}
        bottom={edge()}
        bottomLeft={c().num != null ? (large() ? 57 : 36) : edge()}
      />
      <view
        alpha={c().current && !props.focused ? 1 : 0}
        width={props.w}
        height={props.ih}
        borderRadius={m().r}
        color="#00000001"
        border={{ width: m().ring, color: CURRENT }}
      />
      <view alpha={props.focused ? 1 : 0} width={props.w} height={props.ih} borderRadius={m().r} color="#00000001" border={{ width: m().ring, color: WHITE }} />
      <text
        y={props.ih + m().titleTop + c().titleShift}
        fontFamily={c().titleFont}
        fontSize={m().title}
        lineHeight={m().title * 1.25}
        letterSpacing={themeSpacing()}
        maxWidth={props.w}
        maxLines={2}
        color="#ffffffff"
        textShadow={TITLE_SHADOW}
      >
        {c().title}
      </text>
    </view>
  )
}
