import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { getRenderer } from '@solidtv/solid'
import { drawn, spriteFrames } from './shell/sprite.js'

// The renderer can't draw clipped fans, so public/spinner holds the 25 frames of its 1.25s cycle.
// `size` is the box the caller leaves for it (64 by default), and at 48 and under it's the 36px
// small spinner. It only turns while it can be seen, since every turn draws a frame and a hidden
// spinner on a kept-alive page would keep the whole app from going idle.
const FRAMES = 25
const STEP = 1250 / FRAMES
const sheet = (px, src) => {
  const frames = {}
  for (let f = 0; f < FRAMES; f++) frames[f] = { x: f * px, y: 0, w: px, h: px }
  return { src, map: { frames } }
}
const MEDIUM = sheet(72, 'spinner/spinner-m.webp')
const SMALL = sheet(36, 'spinner/spinner-s.webp')

export default function Spinner(props) {
  const [frame, setFrame] = createSignal(0)
  let node
  const box = () => props.size || 64
  const px = () => (box() <= 48 ? 36 : 72)
  const frames = () => spriteFrames(px() === 36 ? SMALL : MEDIUM)
  // drawn() counts every ancestor's alpha too. Faded out by its caller, it doesn't listen at all.
  const hidden = createMemo(() => props.alpha === 0)
  createEffect(() => {
    if (hidden()) return
    const renderer = getRenderer()
    let due = 0
    const tick = (_, at) => {
      if (!drawn(node)) {
        due = 0
        return
      }
      if (!due) due = at.time + STEP
      else if (at.time >= due) {
        // One step a frame at most, so a stall doesn't race through the steps it missed.
        due = at.time - due >= STEP ? at.time + STEP : due + STEP
        setFrame((frame() + 1) % FRAMES)
      }
    }
    renderer.on('frameTick', tick)
    onCleanup(() => renderer.off('frameTick', tick))
  })
  return (
    <view
      ref={(n) => {
        node = n
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={box()}
      height={box()}
      alpha={props.alpha === undefined ? 1 : props.alpha}
    >
      <view x={(box() - px()) / 2} y={(box() - px()) / 2} width={px()} height={px()} texture={frames()[frame()]} />
    </view>
  )
}
