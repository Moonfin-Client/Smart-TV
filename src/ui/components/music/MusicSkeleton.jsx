import { For, createSignal, onCleanup, onMount } from 'solid-js'
import { perfTier } from '../../tier.js'
import { drawn } from '../shell/sprite.js'

const BONE = '#ffffff24'
const ROW_H = 433
const ROWS = [245, 280, 315].map((titleW, i) => ({ y: 311 + i * ROW_H, titleW }))
const CARDS = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => 60 + c * 264)
const CHIPS = [0, 1, 2, 3, 4].map((c) => 60 + c * 150)

export default function MusicSkeleton(props) {
  const [dim, setDim] = createSignal(false)
  let root
  onMount(() => {
    if (perfTier() === 'low') return
    setDim(true)
    const id = setInterval(() => {
      if (drawn(root)) setDim(!dim())
    }, 1300)
    onCleanup(() => clearInterval(id))
  })
  return (
    <view
      ref={root}
      y={props.y || 0}
      width={1920}
      height={1400}
      transition={{ alpha: { duration: 1300, easing: 'ease-in-out' } }}
      alpha={dim() ? 0.45 : 1}
    >
      <view x={60} y={8} width={1800} height={220} borderRadius={12} color="#ffffff0f">
        <view x={16} y={16} width={188} height={188} borderRadius={8} color={BONE} />
        <view x={224} y={77} width={220} height={22} borderRadius={4} color={BONE} />
        <view x={224} y={109} width={140} height={14} borderRadius={4} color={BONE} />
        <view x={224} y={131} width={80} height={12} borderRadius={4} color={BONE} />
      </view>
      <For each={CHIPS}>{(x) => <view x={x} y={246} width={140} height={57} borderRadius={22} color={BONE} />}</For>
      <For each={ROWS}>
        {(row) => (
          <view y={row.y} width={1920} height={ROW_H}>
            <view x={60} y={2} width={row.titleW} height={28} borderRadius={4} color={BONE} />
            <For each={CARDS}>
              {(x) => (
                <view x={x} y={69} width={240} height={281}>
                  <view width={240} height={240} borderRadius={8} color={BONE} />
                  <view y={261} width={180} height={20} borderRadius={4} color={BONE} />
                </view>
              )}
            </For>
          </view>
        )}
      </For>
    </view>
  )
}
