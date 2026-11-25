import { createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { openNativeInput, stageRect } from './nativeInput.js'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { drawn } from '../shell/sprite.js'
import { spacingFor, textWidth, themeDy } from './look.js'
import { FIELD_LOOKS as LOOKS } from './loginLayout.js'

// A text field. `look` is login (the sign-in fields), address (Add Server, with a globe and
// rounder corners) or pin (the PIN gate, big dots, no focus change). The PIN's letter spacing only
// moves the caret. While a keyboard edits it, `editing` hides the placeholder and shows a blinking
// caret after the text. Its node has openNative(options), as TextField's does.
const NONE = '#00000000'

// Every field's caret steps on one shared 530 ms timer, which runs while any field is mounted.
const blinkers = new Set()
let blinkTimer = null
const onBlinkTick = (fn) => {
  blinkers.add(fn)
  if (!blinkTimer) blinkTimer = setInterval(() => blinkers.forEach((tick) => tick()), 530)
  return () => {
    blinkers.delete(fn)
    if (blinkers.size) return
    clearInterval(blinkTimer)
    blinkTimer = null
  }
}

export default function LoginField(props) {
  const [blink, setBlink] = createSignal(1)
  const placeholderFont = uiFont()
  const l = () => LOOKS[props.look] || LOOKS.login
  const w = () => props.w || 789.4
  const lit = () => l().focusable && !!props.focused
  const border = () => (lit() ? 4 : 1)
  const h = () => 2 * border() + 2 * l().padY + l().lh
  const a = () => props.accent || '#00a4dc'
  const shown = () => {
    const v = String(props.value || '')
    return props.secret ? v.replace(/[\s\S]/g, '•') : v
  }
  const textX = () => border() + (l().icon || l().padX)
  const room = () => w() - textX() - border() - l().padX
  const textW = createMemo(() => textWidth(shown(), l().size, 'regular', l().spacing))
  // A line longer than the field scrolls so its end stays in view.
  const textLeft = () => -Math.max(0, textW() + 4 - room())
  const ink = () => (lit() ? '#000000' : '#ffffff')
  // The caret goes after the typed text's width, not the dots'.
  const caretX = () => textLeft() + textWidth(String(props.value || ''), l().size, 'regular', l().caretSpacing || l().spacing)
  const caretOn = () => (props.editing && shown() ? blink() : 0)
  let root
  onMount(() => {
    onCleanup(
      onBlinkTick(() => {
        if (!props.editing || !drawn(root)) {
          if (blink() !== 1) setBlink(1)
          return
        }
        setBlink(blink() ? 0 : 1)
      })
    )
  })
  // Opens the TV's own keyboard over this field, for Keyboard Style Native.
  const openNative = (options = {}) =>
    openNativeInput({ password: !!props.secret, ...options, rect: stageRect(root && root.lng, w(), h()) })
  return (
    <view
      ref={(n) => {
        root = n
        n.openNative = openNative
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      onPointerOver={props.onPointerOver}
      width={w()}
      height={h()}
      alpha={props.alpha == null ? 1 : props.alpha}
    >
      <view width={w()} height={h()} borderRadius={l().r} color={lit() ? '#ffffff' : '#ffffff14'} />
      <view width={w()} height={h()} borderRadius={l().r} color={NONE} border={{ width: 1, color: hex(l().rest) }} alpha={lit() ? 0 : 1} />
      <view width={w()} height={h()} borderRadius={l().r} color={NONE} border={{ width: 4, color: hex(a()) }} alpha={lit() ? 1 : 0} />
      <view
        x={28.38}
        y={(h() - 30.05) / 2}
        width={30.05}
        height={30.05}
        src={l().icon > 0 ? 'icons/acc_language.webp' : undefined}
        color={ink()}
        alpha={l().icon > 0 ? 1 : 0}
      />
      <view x={textX()} y={border() + l().padY} width={room()} height={l().lh} clipping>
        <text
          y={(l().size * 0.0918) + themeDy(l().size, placeholderFont)}
          fontFamily={placeholderFont}
          fontSize={l().size}
          lineHeight={l().lh}
          color={lit() ? '#00000080' : '#ffffff80'}
          alpha={!shown() && !props.editing ? 1 : 0}
          letterSpacing={spacingFor(placeholderFont)}
        >
          {props.placeholder || ' '}
        </text>
        <text
          y={(l().size * 0.0918) + themeDy(l().size, fontFor(shown()))}
          fontFamily={fontFor(shown())}
          fontSize={l().size}
          lineHeight={l().lh}
          letterSpacing={(l().spacing || 0.001) + spacingFor(fontFor(shown()))}
          x={textLeft()}
          color={ink()}
        >
          {shown() || ' '}
        </text>
        <view x={caretX()} y={(l().lh - l().size * 1.2) / 2} width={2} height={l().size * 1.2} color={a()} alpha={caretOn()} />
      </view>
    </view>
  )
}
