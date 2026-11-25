import { Show, createEffect, createMemo, on, onCleanup } from 'solid-js'
import { textWidth } from './measure.js'
import { drawn } from '../shell/sprite.js'
import { tx } from '../../fx.js'

// The marquee the details action pills use: a line too long for its box scrolls while `active`,
// with a second copy trailing the first behind a dot so the start comes around again without a
// jump. It rests 1.5s, scrolls one copy along at 50ms a canvas point (1.45px), snaps back and goes
// again. Inactive, or short enough to fit, it's the plain line cut with an ellipsis. Home's
// LoopMarquee has its own box and lift, so this one stays separate.
//
// Props: `text`, `font`, `weight` (measure.js's, for the width), `size`, `lh` (the line height the
// text uses), `textcolor`, `maxw` (the box), `active`, `x`, `y`, `alpha`.
const MS_PER_PIXEL = 50 / 1.45
const PAUSE_MS = 1500
const DOT = 6
const DOT_GAP = 9

const marqueeDistance = (textW) => textW + DOT_GAP + DOT + DOT_GAP
const marqueeDuration = (distance) => distance * MS_PER_PIXEL

export default function LoopMarquee(props) {
  let mover
  let timer = null
  const size = () => props.size || 20
  const textW = createMemo(() => textWidth(props.text || '', size(), props.weight || 'regular'))
  const overflows = createMemo(() => Boolean(props.active) && textW() > (props.maxw || 0) + 0.5)
  const distance = () => marqueeDistance(textW())
  const lineH = () => props.lh || Math.round(size() * 1.2)
  const pad = () => Math.round(size() / 2)

  const stop = () => {
    clearTimeout(timer)
    timer = null
    if (mover) mover.x = 0
  }
  // Rest, scroll one copy along, snap back. A marquee nobody can see waits without drawing.
  const cycle = () => {
    timer = setTimeout(() => {
      if (!mover || !drawn(mover)) return cycle()
      const d = distance()
      const ms = marqueeDuration(d)
      mover.x = 0
      mover.animate({ x: -d }, { duration: ms, easing: 'linear' }).start()
      timer = setTimeout(() => {
        if (mover) mover.x = 0
        cycle()
      }, ms)
    }, PAUSE_MS)
  }
  createEffect(
    on([overflows, () => props.text], ([on]) => {
      stop()
      if (on) cycle()
    }),
  )
  onCleanup(() => clearTimeout(timer))

  return (
    <view x={props.x || 0} y={props.y || 0} alpha={props.alpha == null ? 1 : props.alpha} transition={tx(props.transition)}>
      <Show
        when={overflows()}
        fallback={
          <text
            fontFamily={props.font}
            fontSize={size()}
            lineHeight={lineH()}
            color={props.textcolor}
            maxWidth={props.maxw || undefined}
            maxLines={1}
          >
            {props.text || ''}
          </text>
        }
      >
        <view y={-pad()} width={props.maxw} height={lineH() + 2 * pad()} clipping>
          <view
            ref={(n) => {
              mover = n
              onCleanup(() => mover === n && (mover = null))
            }}
            y={pad()}
            width={distance() + textW()}
            height={lineH()}
          >
            <text fontFamily={props.font} fontSize={size()} lineHeight={lineH()} color={props.textcolor}>
              {props.text || ''}
            </text>
            <view x={textW() + DOT_GAP} y={(lineH() - DOT) / 2} width={DOT} height={DOT} borderRadius={3} color={props.textcolor} alpha={0.7} />
            <text x={distance()} fontFamily={props.font} fontSize={size()} lineHeight={lineH()} color={props.textcolor}>
              {props.text || ''}
            </text>
          </view>
        </view>
      </Show>
    </view>
  )
}
