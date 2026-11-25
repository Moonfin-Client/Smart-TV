import { createSignal, onCleanup, onMount } from 'solid-js'

// The sign-in spinner: a quarter ring turning once a second. `thick` picks the ring's thickness
// (12 for 2dp on 24dp, 9 for 4dp on 36dp, 7 for 2.5dp on 18dp), `tint` its color. It skips its turn
// while it can't be seen, so a hidden one never keeps the app drawing.
export default function Ring(props) {
  const [turns, setTurns] = createSignal(0)
  let node
  onMount(() => {
    const turn = () => {
      const lng = node && node.lng
      if (!lng || !node.parent || lng.worldAlpha === 0) return
      setTurns(turns() + 1)
    }
    turn()
    const timer = setInterval(turn, 1000)
    onCleanup(() => clearInterval(timer))
  })
  const size = () => props.size || 40
  return (
    <view
      ref={node}
      x={props.x || 0}
      y={props.y || 0}
      width={size()}
      height={size()}
      pivot={0.5}
      rotation={turns() * Math.PI * 2}
      transition={{ rotation: { duration: 1000, easing: 'linear' } }}
    >
      <view width={size()} height={size()} src={`icons/acc_arc${props.thick || 12}.webp`} color={props.tint || '#00a4dcff'} />
    </view>
  )
}
