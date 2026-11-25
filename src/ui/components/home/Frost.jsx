import { createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import { getRenderer } from '@solidtv/solid'
import { coverRegion } from './barMath.js'

// A frosted glass box at sx, sy on screen: the server's blurred copy of the backdrop, as it would lie
// cover-fit across the whole screen, cut to the box and rounded. This renderer has no rounded clip,
// so the box draws the matching part of the picture as a SubTexture. Props: img, sx, sy, fw, fh,
// radius and ms.
// shortcut: ms (keeping the picture still while the box moves) is ignored, since the bars hide
// their frost whenever the box animates. Animate the SubTexture's rect if a holder needs it.
export default function Frost(props) {
  const [nat, setNat] = createSignal(null)
  let last = null
  const texture = createMemo(() => {
    const n = nat()
    const img = props.img
    if (!img || !props.fw || !props.fh) return (last = null)
    // The picture before stays up until the next one has loaded, as a live backdrop blur would.
    if (!n || n.src !== img) return last
    const tx = getRenderer().stage.txManager
    const parent = tx.createTexture('ImageTexture', { src: img })
    return (last = tx.createTexture('SubTexture', { texture: parent, ...coverRegion(n.w, n.h, props.sx, props.sy, props.fw, props.fh) }))
  })
  // A SubTexture listens on its picture until it's destroyed, so the old one goes once the node has the next.
  createEffect(on(texture, (now, before) => before && before !== now && before.destroy()))
  onCleanup(() => texture() && texture().destroy())
  return (
    <view>
      <view
        width={1}
        height={1}
        alpha={0.001}
        src={props.img || ''}
        onEvent={{
          loaded: (node, e) => {
            const d = e && e.dimensions
            if (d && d.w && d.h) setNat({ src: node.src, w: d.w, h: d.h })
          },
        }}
      />
      <view
        width={props.fw}
        height={props.fh}
        borderRadius={props.radius || 0}
        color="#ffffffff"
        texture={texture()}
        alpha={texture() ? 1 : 0}
      />
    </view>
  )
}
