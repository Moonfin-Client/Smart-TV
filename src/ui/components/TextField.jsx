import { fontFor, uiFont } from '../text.js'
import { openNativeInput, stageRect } from './account/nativeInput.js'

// A one-line text box. The holder owns focus and the value and passes `focused`. `secret` shows dots,
// `placeholder` shows while it's empty, `label` sits above it.
// openNative({value, password, maxLength, onChange, onClose}), on the node handed to ref, gives the
// field to the TV's own keyboard (webOS VKB, Tizen IME): a real input over this field takes the
// typing, onChange(text) brings it back and onClose(submitted, key) ends it. usesNativeKeyboard()
// in account/nativeInput.js says when the setting asks for it.
export default function TextField(props) {
  const labelFont = () => uiFont('medium')
  const w = () => props.w || 800
  const shown = () => {
    const v = props.value || ''
    if (!v) return props.placeholder || ''
    return props.secret ? '•'.repeat(v.length) : v
  }
  let root
  const openNative = (options = {}) =>
    openNativeInput({ password: !!props.secret, ...options, rect: stageRect(root && root.lng, w(), 80) })
  return (
    <view
      ref={(n) => {
        root = n
        n.openNative = openNative
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
    >
      <text y={-40} fontFamily={labelFont()} fontSize={24} color="#b0b0b0ff" alpha={props.label ? 1 : 0}>
        {props.label || ' '}
      </text>
      <view width={w()} height={80} borderRadius={14} color={props.focused ? '#ffffffff' : '#ffffff1a'}>
        <view x={3} y={3} width={w() - 6} height={74} borderRadius={12} color="#1b1b20ff" alpha={props.focused ? 1 : 0} />
        <text
          x={26}
          y={22}
          fontFamily={fontFor(shown())}
          fontSize={30}
          maxWidth={w() - 52}
          maxLines={1}
          color={props.value ? '#ffffffff' : '#7a7a80ff'}
        >
          {shown() || ' '}
        </text>
      </view>
    </view>
  )
}
