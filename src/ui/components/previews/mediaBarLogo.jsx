import $L from '../../../services/i18n.js'
import { createMemo, createSignal } from 'solid-js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import { containBox } from './mediaBarKit.js'
import { lineCount } from './kit.js'

// The item's logo fit inside [w] by [h] at [align]'s corner, or its title in up to two lines set at
// that corner. [size], [weight], [lh] (px), [ls] and [ink] style the title.
export default function MediaBarLogo(props) {
  const [nat, setNat] = createSignal(null)
  const box = createMemo(() => {
    const n = nat()
    if (!n || n.src !== props.url) return { x: 0, y: 0, w: props.w, h: props.h, shown: false }
    return { ...containBox(n.w, n.h, props.w, props.h, props.align), shown: true }
  })
  const text = () => (props.url ? '' : props.title || '')
  const weight = () => props.weight || 'bold'
  const textY = () => {
    if (props.align === 'topLeft') return cssShift(props.size)
    const lines = Math.min(2, lineCount(text(), props.size, weight(), props.w, props.ls || 0))
    return props.h - lines * props.lh + cssShift(props.size)
  }
  const center = () => props.align === 'bottomCenter'
  return (
    <view x={props.x || 0} y={props.y || 0} width={props.w} height={props.h}>
      <view
        x={box().x}
        y={box().y}
        width={box().w}
        height={box().h}
        src={props.url || ''}
        color={props.url ? '#ffffffff' : '#00000000'}
        alpha={box().shown ? 1 : 0.001}
        onEvent={{
          loaded: (node, e) => {
            const d = e && e.dimensions
            if (props.url && d && d.w && d.h) setNat({ src: props.url, w: d.w, h: d.h })
          },
        }}
      />
      <text
        fontFamily={fontFor(text(), weight())}
        fontSize={props.size}
        lineHeight={props.lh}
        letterSpacing={props.ls || 0}
        y={textY()}
        maxWidth={props.w}
        maxLines={2}
        contain={center() ? 'width' : undefined}
        textAlign={center() ? 'center' : 'left'}
        color={props.ink}
      >
        {text()}
      </text>
    </view>
  )
}

// The new release label in its small form, for the sample's new season: a 1px white rule down the
// left of the uppercase kind and the season under it. 44.4 tall.
export const RELEASE_H = 16.8 + 27.6
const LABEL_Y = cssShift(14)
const DETAIL_Y = 16.8 + cssShift(24)
export function MediaBarRelease(props) {
  const font = uiFont('bold')
  return (
    <view x={props.x || 0} y={props.y || 0} width={300} height={44.4}>
      <view width={1} height={44.4} color="#ffffffff" />
      <text fontFamily={font} fontSize={14} lineHeight={16.8} letterSpacing={1} x={11} y={LABEL_Y} color="#ffffffff">
        {$L('New Season').toUpperCase()}
      </text>
      <text fontFamily={font} fontSize={24} lineHeight={27.6} x={11} y={DETAIL_Y} color="#ffffffff">
        {$L('Season {number}').replace('{number}', props.season || 2)}
      </text>
    </view>
  )
}
