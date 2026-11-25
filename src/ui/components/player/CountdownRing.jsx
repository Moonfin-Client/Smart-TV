import { createMemo } from 'solid-js'
import { ringSrc } from './canvasArt.js'
import { tx } from '../../fx.js'

const RAD = Math.PI / 180

// A track ring, and an arc that drains counterclockwise back to the top as progress falls from 1 to
// 0, with round ends. The renderer has no arc shader, so the arc is two half rings, each turned
// about the center inside a clip of its own half, and the round ends are two dots. Its turns ease
// over 300 ms and jump when the ring fills up again, since a refill is a new countdown. Props:
// `size`, `stroke`, `progress`, `track` and `value` (the two colors).
export default function CountdownRing(props) {
  let last = null
  const full = () => ringSrc(props.size, props.stroke, false)
  const half = () => ringSrc(props.size, props.stroke, true)
  const turn = createMemo(() => {
    const v = 360 * Math.min(1, Math.max(0, props.progress || 0))
    const d = last == null || v > last ? 0 : 300
    last = v
    return { v, d, right: Math.min(v, 180) - 180, left: Math.max(v, 180) - 180 }
  })
  const ease = () => ({ rotation: { duration: turn().d, easing: 'linear' } })
  const mid = () => props.size / 2
  const capX = () => (props.size - props.stroke) / 2
  return (
    <view width={props.size} height={props.size}>
      <view width={props.size} height={props.size} src={full()} color={props.track} />
      <view x={mid()} width={mid()} height={props.size} clipping>
        <view x={-mid()} width={props.size} height={props.size} pivot={0.5} src={half()} color={props.value} transition={tx(ease())} rotation={turn().right * RAD} />
      </view>
      <view width={mid()} height={props.size} clipping>
        <view width={props.size} height={props.size} pivot={0.5} src={half()} color={props.value} transition={tx(ease())} rotation={turn().left * RAD} />
      </view>
      <view x={capX()} width={props.stroke} height={props.stroke} borderRadius={props.stroke / 2} color={props.value} />
      <view width={props.size} height={props.size} pivot={0.5} transition={tx(ease())} rotation={turn().v * RAD}>
        <view x={capX()} width={props.stroke} height={props.stroke} borderRadius={props.stroke / 2} color={props.value} />
      </view>
    </view>
  )
}
