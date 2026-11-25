import { Show, createMemo } from 'solid-js'
import { cssShift, textWidth, uiFont } from '../text.js'
import { shadowColor } from '../theme.js'

const NONE = '#00000000'

const SIZES = {
  normal: { h: 72, size: 39, lh: 66, pad: 30, min: 270, grow: 1.05 },
  small: { h: 54, size: 30, lh: 48, pad: 24, min: 150, grow: 1.1 },
}
const FULL = { fill: 1, ink: 1 }
const DIM = { fill: 0.28, ink: 0.28 }
const DIM_FOCUSED = { fill: 0.585, ink: 0.4 }
const SHADOW = { color: shadowColor('#0000004d'), x: 0, y: 18, blur: 18, spread: 0 }

export const neutralWidth = (label, small) => {
  const s = small ? SIZES.small : SIZES.normal
  return Math.min(450, Math.max(s.min, Math.ceil(textWidth(label || '', s.size, 'bold')) + s.pad * 2))
}

// The plain pill's width for a label, which ButtonRow lays out by too.
export const pillWidth = (label, icon) =>
  label ? Math.max(icon ? 72 : 120, label.length * 15 + 56 + (icon ? 44 : 0)) : icon ? 72 : 120

// A button, purely visual: whatever lays buttons out (ButtonRow, a page) owns focus and passes
// `focused`. By default it's a pill. A `neutral` button grows only its fill on focus and gets a
// shadow. `disabled` dims a neutral button's fill and label.
export default function Button(props) {
  const pillFont = () => uiFont('medium')
  const neutralFont = () => uiFont('bold')
  const look = createMemo(() => {
    if (!props.neutral) {
      const w = props.w || pillWidth(props.label, props.icon)
      return { w, h: 64, r: 32, font: { fontFamily: pillFont() }, size: 26, lh: undefined, x: props.icon ? 66 : 28, y: 17, maxW: undefined, grow: 1 }
    }
    const s = props.small ? SIZES.small : SIZES.normal
    const w = props.w || neutralWidth(props.label, props.small)
    return { w, h: s.h, r: 6, font: { fontFamily: neutralFont() }, size: s.size, lh: s.lh, x: s.pad, y: 3 + cssShift(s.size, neutralFont()), maxW: w - s.pad * 2, grow: s.grow }
  })
  const fill = () => {
    if (!props.neutral) return props.focused ? '#ffffffff' : props.primary ? '#00a4dcff' : '#ffffff26'
    return props.focused ? '#e6e6e6ff' : props.selected ? '#3e454dff' : '#7d848cff'
  }
  const ink = () => {
    if (!props.neutral) return props.focused ? '#101010ff' : '#ffffffff'
    return props.focused ? '#4c5059ff' : '#e6e6e6ff'
  }
  const dim = () => (!props.neutral || !props.disabled ? FULL : props.focused ? DIM_FOCUSED : DIM)
  return (
    <view x={props.x || 0} y={props.y || 0} width={look().w} height={look().h}>
      <view
        width={look().w}
        height={look().h}
        pivot={0.5}
        scale={props.focused ? look().grow : 1}
        transition={{ scale: { duration: 200, easing: 'ease-out' } }}
      >
        <view width={look().w} height={look().h} borderRadius={6} color={NONE} shadow={SHADOW} alpha={props.neutral && props.focused ? 1 : 0} />
        <view width={look().w} height={look().h} borderRadius={look().r} color={fill()} alpha={dim().fill} />
      </view>
      <view>
        <Show when={props.icon && !props.neutral}>
          <view x={props.label ? 22 : (look().w - 36) / 2} y={14} width={36} height={36} src={`icons/${props.icon}.webp`} color={ink()} />
        </Show>
      </view>
      <text
        {...look().font}
        fontSize={look().size}
        lineHeight={look().lh}
        x={look().x}
        y={look().y}
        maxWidth={look().maxW}
        maxLines={1}
        textAlign={props.neutral ? 'center' : 'left'}
        contain={props.neutral ? 'width' : 'none'}
        color={ink()}
        alpha={props.label ? dim().ink : 0}
      >
        {props.label || ' '}
      </text>
    </view>
  )
}
