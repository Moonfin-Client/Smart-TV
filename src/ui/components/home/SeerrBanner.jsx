import { cssShift } from '../../text.js'
import { tx } from '../../fx.js'

// A Seerr status banner across the top of a card's art: the status word in the status color,
// inside the art's own border (the theme's width, 4px once focused) so the focus ring still shows
// all around. A word too long for a narrow poster shrinks to fit. Modern cards draw a 33px banner
// with 17px text, the others 20px with 10px. The card passes its width `w`, the `inset`, its
// `radius`, `modern` and `ms`, the time the width eases over as a card grows.
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'

export default function SeerrBanner(props) {
  const h = () => (props.modern ? 33 : 20)
  const size = () => (props.modern ? 17 : 10)
  const room = () => props.w - 2 * props.inset
  const fit = () => (room() > 0 && props.card.bannerW > room() ? room() / props.card.bannerW : 1)
  const corner = () => Math.max(0, props.radius - props.inset)
  const glide = () => ({ duration: props.ms || 0, easing: EASE })
  return (
    <view
      x={props.inset}
      y={props.inset}
      width={room()}
      height={h()}
      borderRadius={[corner(), corner(), 0, 0]}
      color={props.card.bannerFill}
      transition={tx({ width: glide() })}
    >
      <text
        x={room() / 2}
        y={cssShift(size())}
        mountX={0.5}
        fontFamily={props.card.bannerFont}
        fontSize={size()}
        lineHeight={h()}
        letterSpacing={size() / 10}
        scale={fit()}
        color={props.card.bannerInk}
        transition={tx({ x: glide() })}
      >
        {props.card.banner}
      </text>
    </view>
  )
}
