import { createMemo, createSignal, onMount } from 'solid-js'
import Ring from '../Ring.jsx'
import { textReady, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { buttonWidth, BUTTONS } from './loginLayout.js'
import { spacingFor, themeDy } from './look.js'

// The sign-in screens' buttons. They're visual only: the page owns focus and passes `focused`.
// `kind` is outline (Back, Sign In), action (a full width Back), toggle (Quick Connect, Password,
// with `selected`), primary (Connect, Continue), ghost (Use a different address) or round (an
// icon in a circle). A width given in `w` wins over the label's own, as in a shared action row.
// `busy` swaps the label for a spinner ring while signing in.
const NONE = '#00000000'

export default function LoginButton(props) {
  const [fontsIn, setFontsIn] = createSignal(false)
  onMount(() => textReady().then(() => setFontsIn(true)))
  const kind = () => props.kind || 'outline'
  const k = () => BUTTONS[kind()]
  const a = () => props.accent || '#00a4dc'
  const width = createMemo(() => {
    fontsIn()
    return props.w || buttonWidth(kind(), props.label)
  })
  const fill = () => {
    const kd = kind()
    if (kd === 'toggle' && props.selected) return a()
    if (kd === 'primary') return props.disabled ? a() + '8c' : a()
    if (kd === 'ghost') return '#ffffff0f'
    if (kd === 'round') return '#ffffff12'
    return NONE
  }
  const rest = () => {
    const kd = kind()
    if (kd === 'toggle' && props.selected) return NONE
    return kd === 'outline' || kd === 'toggle' || kd === 'action' ? '#ffffff33' : NONE
  }
  const ring = () => (kind() === 'primary' || (kind() === 'toggle' && props.selected) ? '#ffffff' : a())
  const ink = () => {
    const kd = kind()
    if (kd === 'primary') return '#04151c'
    if (kd === 'toggle' && props.selected) return '#ffffff'
    if (kd === 'ghost' || kd === 'round') return props.disabled ? '#ffffff59' : '#ffffffe6'
    return props.focused ? a() : '#ffffffcc'
  }
  const font = () => uiFont(k().weight === 'bold' ? 'bold' : 'medium')
  const on = () => (props.focused ? 1 : 0)
  const fade = () => (props.disabled && (kind() === 'outline' || kind() === 'toggle' || kind() === 'action') ? 0.5 : 1)
  return (
    <view x={props.x || 0} y={props.y || 0} onPointerOver={props.onPointerOver} width={width()} height={k().h} alpha={fade()}>
      <view width={width()} height={k().h} borderRadius={k().r} color={fill()} />
      <view width={width()} height={k().h} borderRadius={k().r} color={NONE} border={{ width: 1, color: hex(rest()) }} alpha={1 - on()} />
      <view width={width()} height={k().h} borderRadius={k().r} color={NONE} border={{ width: k().ring, color: hex(ring()) }} alpha={on()} />
      <view
        x={(width() - k().icon) / 2}
        y={(k().h - k().icon) / 2}
        width={k().icon}
        height={k().icon}
        src={props.icon ? `icons/acc_${props.icon}.webp` : undefined}
        color={ink()}
        alpha={props.icon ? 1 : 0}
      />
      <text
        fontFamily={font()}
        fontSize={k().size || 1}
        lineHeight={k().lh || 1}
        x={width() / 2}
        y={((k().h - k().lh) / 2 + k().size * 0.0918) + themeDy(k().size || 1, font())}
        mountX={0.5}
        color={ink()}
        alpha={!props.busy && !props.icon ? 1 : 0}
        letterSpacing={spacingFor(font())}
      >
        {props.label || ' '}
      </text>
      <view alpha={props.busy ? 1 : 0}>
        <Ring
          x={(width() - k().spin) / 2}
          y={(k().h - k().spin) / 2}
          size={k().spin || 1}
          tint={kind() === 'primary' ? '#04151c' : '#ffffff'}
          thick={kind() === 'primary' ? 7 : 12}
        />
      </view>
    </view>
  )
}
