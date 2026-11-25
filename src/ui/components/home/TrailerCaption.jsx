import { createRoot, createSignal } from 'solid-js'
import { insert, rootNode } from '@solidtv/solid'
import { fontFor } from '../../text.js'
import { tx } from '../../fx.js'
import { wrapLines } from '../details/measure.js'

// A YouTube trailer's captions over its frame: centered across the middle 80% of it, white with a
// dark glow, the last line 7% of the frame up from its bottom. Props: text(), shown() and rect()
// (the frame in 1920x1080 pixels), all accessors. fade eases the captions in and out with shown().
const SIZE = 32
const LINE = SIZE * 1.4
const GLOW = [
  { color: '#000000e6', x: 0, y: 0, blur: 6 },
  { color: '#000000e6', x: 0, y: 2, blur: 4 },
]

export function TrailerCaption(props) {
  const box = () => {
    const r = props.rect()
    return { x: r.x + r.w * 0.1, w: r.w * 0.8, bottom: r.y + r.h * 0.93 }
  }
  const lines = () => wrapLines(props.text(), SIZE, 'regular', box().w)
  return (
    <view alpha={props.shown() ? 1 : 0} transition={props.fade ? tx({ alpha: { duration: 300, easing: 'ease' } }) : undefined}>
      <text
        x={box().x}
        y={box().bottom - lines().length * LINE}
        maxWidth={box().w}
        contain="width"
        textAlign="center"
        fontFamily={fontFor(props.text())}
        fontSize={SIZE}
        lineHeight={LINE}
        color="#ffffffff"
        textShadow={GLOW}
      >
        {lines().join('\n') || ' '}
      </text>
    </view>
  )
}

// Draws TrailerCaption in App's layer over the pages, for a holder that isn't a component. Returns
// what takes it down.
export const mountTrailerCaption = (props) => {
  const host = rootNode.searchChildrenById('overNav') || rootNode
  const [gone, setGone] = createSignal(false)
  createRoot((dispose) => insert(host, () => (gone() ? dispose() : <TrailerCaption {...props} />), null))
  return () => setGone(true)
}
