import { createSignal, onCleanup, onMount } from 'solid-js'
import { FRAMES, STRIDE_DURATION, runnerSheet } from './runner.js'
import { drawn, spriteFrames } from '../sprite.js'

// The running figure of the screensaver and loading animation: `size` px square, one stride every
// 620ms divided by `speed`, facing left while `left` is true.
export default function Runner(props) {
  const [f, setF] = createSignal(0)
  let node
  const frames = () => spriteFrames(runnerSheet(props.size))
  onMount(() => {
    const started = Date.now()
    const period = STRIDE_DURATION / (props.speed || 1)
    const timer = setInterval(() => {
      if (drawn(node)) setF(Math.floor((((Date.now() - started) % period) / period) * FRAMES))
    }, Math.max(16, period / FRAMES))
    onCleanup(() => clearInterval(timer))
  })
  return (
    <view
      ref={node}
      x={props.x || 0}
      y={props.y || 0}
      width={props.size}
      height={props.size}
      texture={frames()[(props.left ? FRAMES : 0) + f()]}
    />
  )
}
