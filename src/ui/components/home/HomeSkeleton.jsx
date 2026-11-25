import { For, createSignal, onCleanup, onMount } from 'solid-js'
import { onScreen } from './onScreen.js'
import { hex } from '../../color.js'
export { skeletonBoxes } from './rowLayout.js'

// Home while its first rows load: four rows of placeholder cards under a bar for each title,
// breathing between 45 and 100 percent every 1.3 seconds. The lowest tier holds them still.
// Props: `layout` (skeletonBoxes()), `ink`, `still`, `panelW`, `inset`.

const BREATHE_MS = 1300
const PANEL_EDGE = { width: 1, color: hex('#ffffff1f') }

export default function HomeSkeleton(props) {
  // Starts dim so the first breath rises.
  const [dim, setDim] = createSignal(!props.still)
  let root
  let timer = null
  // Breathes only while it shows, so a hidden skeleton never keeps the renderer drawing.
  const breathe = () => {
    setDim(!props.still && onScreen(root) ? !dim() : false)
    timer = setTimeout(breathe, BREATHE_MS)
  }
  onMount(() => (timer = setTimeout(breathe, 0)))
  onCleanup(() => clearTimeout(timer))
  return (
    <view ref={root} width={1920} height={1080} alpha={dim() ? 0.45 : 1} transition={{ alpha: { duration: 1300, easing: 'ease-in-out' } }}>
      <For each={props.layout.boxes}>{(b) => <view x={b.x} y={b.y} width={b.w} height={b.h} borderRadius={b.r} color={props.ink} />}</For>
      <For each={props.layout.panels}>
        {(p) => <view x={props.inset} y={p.y} width={props.panelW} height={556} borderRadius={28} color="#ffffff0f" border={PANEL_EDGE} />}
      </For>
    </view>
  )
}
