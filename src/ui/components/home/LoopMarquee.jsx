import { Show, createEffect, createMemo, on, onCleanup } from 'solid-js'
import { cssShift, textWidth } from '../../text.js'

// A line too long for its box scrolls while `active`, with a second copy trailing the first behind a
// dot so the start comes around again without a jump. It rests, scrolls one copy along at 50ms a
// canvas point, snaps back and goes again. Otherwise it ends in an ellipsis. Props: `text`, `font`,
// `size`, `lh`, `ink`, `width`, `active`, `weight`, plus `x` and `y`.

const MS_PER_PIXEL = 50 / 1.45
const PAUSE_MS = 1500
// A 4 point dot inside a 16 point gap.
const DOT_W = 6
const DOT_GAP = 9

export default function LoopMarquee(props) {
  let track
  let timer = null
  let anim = null
  const measured = createMemo(() => textWidth(props.text || '', props.size, props.weight || 'regular'))
  const overflows = createMemo(() => !!props.active && measured() > props.width + 0.5)
  const distance = () => measured() + DOT_GAP * 2 + DOT_W
  const lift = () => cssShift(props.size)

  const stop = () => {
    clearTimeout(timer)
    timer = null
    if (anim) anim.stop()
    anim = null
    if (track) track.x = 0
  }
  // Restarted from 0 on every lap, so it's driven on the node rather than bound.
  const cycle = () => {
    timer = setTimeout(() => {
      const duration = distance() * MS_PER_PIXEL
      anim = track.animate({ x: -distance() }, { duration, easing: 'linear' })
      anim.start()
      timer = setTimeout(() => {
        stop()
        cycle()
      }, duration)
    }, PAUSE_MS)
  }
  createEffect(
    on(overflows, (moving) => {
      stop()
      if (moving) cycle()
    }),
  )
  onCleanup(stop)

  return (
    <view x={props.x || 0} y={props.y || 0} width={props.width} height={props.lh} clipping>
      <view ref={track} width={distance() * 2 + props.width} height={props.lh}>
        <text
          y={lift()}
          fontFamily={props.font}
          fontSize={props.size}
          lineHeight={props.lh}
          color={props.ink}
          maxWidth={overflows() ? 0 : props.width}
          maxLines={1}
        >
          {props.text || ''}
        </text>
        <Show when={overflows()}>
          <view x={measured() + DOT_GAP} y={(props.lh - DOT_W) / 2} width={DOT_W} height={DOT_W} borderRadius={3} color={props.ink} alpha={0.7} />
          <text x={distance()} y={lift()} fontFamily={props.font} fontSize={props.size} lineHeight={props.lh} color={props.ink}>
            {props.text || ''}
          </text>
        </Show>
      </view>
    </view>
  )
}
