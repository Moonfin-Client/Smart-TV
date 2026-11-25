import { Show, onCleanup, onMount } from 'solid-js'
import { fontFor } from '../../text.js'
import { BASELINE_DROP } from './measure.js'

// A reaction rising over the video with the sender's name under it. Over three seconds, eased out,
// it fades in, grows from 60% and rises 40px by 15%, then rises to 340px and fades out. It runs its
// two animations once, so nothing ticks for it after that. It starts barely visible, so its glyph
// has loaded by the time it shows.
export default function PartyFloat(props) {
  let node
  const timers = []
  onMount(() => {
    timers.push(
      setTimeout(() => {
        if (node) node.animate({ y: -40, scale: 1, alpha: 1 }, { duration: 450, easing: 'ease-out' }).start()
      }, 20),
      setTimeout(() => {
        if (node) node.animate({ y: -340, alpha: 0 }, { duration: 2550, easing: 'ease-out' }).start()
      }, 470),
    )
  })
  onCleanup(() => timers.forEach(clearTimeout))
  return (
    <view x={props.x} y={props.y}>
      <view ref={node} width={props.fw} height={props.name ? 117 : 76} pivot={0.5} scale={0.6} alpha={0.001}>
        <view x={(props.fw - 76) / 2} width={76} height={76} src={`party/${props.reaction}.webp`} />
        <Show when={props.name}>
          <view x={(props.fw - props.tw) / 2} y={80} width={props.tw} height={37} borderRadius={8} color="#101010cc">
            <text x={10} y={2 + BASELINE_DROP * 18} fontFamily={fontFor(props.name || '', 'medium')} fontSize={18} lineHeight={33} color="#ffffff">
              {props.name}
            </text>
          </view>
        </Show>
      </view>
    </view>
  )
}
