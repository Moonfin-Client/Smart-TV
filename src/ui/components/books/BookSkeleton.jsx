import { For, createSignal, onCleanup, onMount } from 'solid-js'
import { tier } from '../../tier.js'

const CELLS = []
for (let i = 0; i < 20; i++) CELLS.push({ x: 87 + (i % 5) * 349 + 16, y: 10 + Math.floor(i / 5) * 584 + 20 })

export default function BookSkeleton(props) {
  const [dim, setDim] = createSignal(false)
  const box = props.look && props.look.t.isGlass ? '#ffffff29' : props.look ? props.look.os(0.14) : '#ffffff24'
  onMount(() => {
    // The legacy tier holds still to spare slow TVs the animation.
    if (tier.legacy) return
    setDim(true)
    const timer = setInterval(() => setDim(!dim()), 1300)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <view width={1920} height={1080} transition={{ alpha: { duration: 1300, easing: 'ease-in-out' } }} alpha={dim() ? 0.45 : 1}>
      <For each={CELLS}>
        {(c) => (
          <view x={c.x} y={c.y} width={317} height={446}>
            <view width={317} height={400} borderRadius={10} color={box} />
            <view y={406} width={237.75} height={19} borderRadius={4} color={box} />
            <view y={429} width={142.65} height={17} borderRadius={4} color={box} />
          </view>
        )}
      </For>
    </view>
  )
}
