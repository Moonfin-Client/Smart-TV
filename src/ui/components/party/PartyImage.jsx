import { createEffect, createSignal, on } from 'solid-js'

// A picture that covers its box, trying each address in `srcs` in turn when one fails to load, so a
// room's art falls back from the backdrop to the poster.
const COVER = { resizeMode: { type: 'cover' } }

export default function PartyImage(props) {
  const [step, setStep] = createSignal(0)
  createEffect(on(() => props.srcs, () => setStep(0), { defer: true }))
  const src = () => (props.srcs || [])[step()] || ''
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={props.w}
      height={props.h}
      borderRadius={props.r || 0}
      src={src() || undefined}
      alpha={src() ? 1 : 0}
      textureOptions={COVER}
      onEvent={{ failed: () => step() < (props.srcs || []).length && setStep(step() + 1) }}
    />
  )
}
