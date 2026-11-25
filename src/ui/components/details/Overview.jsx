import $L from '../../../services/i18n.js'
import { createEffect, createSignal, on } from 'solid-js'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { pointerFocus } from '../../../app/pointer.js'

// The overview on Modern: copy that fits four lines is plain text, longer copy sits in a focusable
// box with Read More under it. Enter opens it in place to 319px, where Up and Down page through it
// 58px at a time until it runs out, and Back or Enter closes it again.
//
// Props: `text`, `font`, `box` ({canToggle, textW, lines, width} from modern/hero.js), `expanded`,
// `tokens`, `x`, `y`, `alpha`, `variant` ('stage' for Stage's 23.4px copy or 'classic' for
// Classic's tighter, dimmer copy) and `spacing`, the theme's letter spacing (Neon Pulse's 0.6px).
// Enter calls onOverviewToggle(), and a press with nowhere left to scroll goes on to the page.
const LH = 29
const STEP = 58
const NO_BOX = { canToggle: false, textW: 1160, lines: 0, width: 1160 }
const EDGE = hex('#ffffff14')

export default function Overview(props) {
  const [scroll, setScroll] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const b = () => props.box || NO_BOX
  const t = () => props.tokens || { accent: '#0a84ffff', focus: '#00a4dcff' }
  const lh = () => (props.variant === 'stage' ? 35.1 : props.variant === 'classic' ? 28 : LH)
  const size = () => (props.variant === 'stage' ? 23.4 : 20)
  const ink = () => (props.variant === 'stage' ? '#ffffffd1' : props.variant === 'classic' ? '#e6e6e6cc' : '#ffffffd9')
  // The box's own height: four lines and the button, or up to 319px open.
  const h = () => {
    if (!b().canToggle) return b().lines * lh()
    const full = 36 + b().lines * lh() + 12 + 33
    return props.expanded ? Math.min(319, full) : 36 + 4 * lh() + 12 + 33
  }
  // How far the open box can scroll its text and button.
  const room = () => (props.expanded ? Math.max(0, 36 + b().lines * lh() + 12 + 33 - h()) : 0)
  const pad = () => (focused() ? 17 : 18)
  // Pixel themes square off every fixed radius.
  const r = () => (t().isPixel ? 0 : 17)
  createEffect(on(() => props.expanded, () => setScroll(0), { defer: true }))
  return (
    <view
      ref={props.ref}
      x={props.x || 0}
      y={props.y || 0}
      width={b().width}
      height={h()}
      alpha={props.alpha == null ? 1 : props.alpha}
      onFocusChanged={setFocused}
      // The Magic Remote's cursor focuses it, and OK then presses it (app/pointer.js).
      onPointerOver={(n) => pointerFocus(n)}
      onEnter={() => {
        if (b().canToggle && props.onOverviewToggle) props.onOverviewToggle()
        return true
      }}
      onUp={() => {
        if (props.expanded && scroll() > 1) {
          setScroll(Math.max(0, scroll() - STEP))
          return true
        }
        return false
      }}
      onDown={() => {
        if (props.expanded && room() - scroll() > 1) {
          setScroll(Math.min(room(), scroll() + STEP))
          return true
        }
        return false
      }}
    >
      <view alpha={b().canToggle ? 1 : 0} width={b().width} height={h()} borderRadius={r()} color={focused() ? '#ffffff0a' : '#ffffff05'} />
      <view
        alpha={b().canToggle && !focused() ? 1 : 0}
        width={b().width}
        height={h()}
        borderRadius={r()}
        color="#00000001"
        border={{ width: 1, color: EDGE }}
      />
      <view
        alpha={b().canToggle && focused() ? 1 : 0}
        width={b().width}
        height={h()}
        borderRadius={r()}
        color="#00000001"
        border={{ width: 1, color: hex(t().focus) }}
      />
      <view width={b().width} height={h()} clipping={b().canToggle}>
        <view y={(b().canToggle ? pad() : 0) - scroll()} x={b().canToggle ? pad() : 0} width={b().width} height={b().lines * lh() + 13.5 + 33}>
          <text
            y={2}
            fontFamily={props.font}
            fontSize={size()}
            lineHeight={lh()}
            maxWidth={b().textW}
            maxLines={props.expanded ? 0 : 4}
            letterSpacing={props.spacing || 0}
            color={ink()}
          >
            {props.text || ''}
          </text>
          <text
            alpha={b().canToggle ? 1 : 0}
            y={(props.expanded ? b().lines : Math.min(4, b().lines)) * lh() + 13.5}
            fontFamily={uiFont('bold')}
            fontSize={17}
            letterSpacing={props.spacing || 0}
            lineHeight={33}
            color={t().accent}
          >
            {props.expanded ? $L('Read Less') : $L('Read More')}
          </text>
        </view>
      </view>
    </view>
  )
}
