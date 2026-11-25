import $L from '../../../services/i18n.js'
import { createMemo, createSignal } from 'solid-js'
import { hex } from '../../color.js'
import { uiFont } from '../../text.js'
import { theme, shadowColor } from '../../theme.js'
import { perfTier } from '../../tier.js'
import { OverNav } from '../../layers.jsx'
import { lineCount, textWidth, withAlpha } from './look.js'

// A centered card over a dimmed screen that asks before everything is wiped. It sits over the whole
// page through <OverNav> and keeps every key. Cancel takes the focus first, Left and Right swap
// between the two buttons, Up and Down stay put, and Back cancels. It calls onClearDataCancel()
// and onClearDataConfirm() on its holder. [ask] puts other words in it: {title, message, confirm}.
// shortcut: the high tier's frosted backdrop blur isn't drawn, only its tinted fill, since a live
// blur of the screen behind costs too much on these TVs.
const TITLE = 30
const MESSAGE = 20
const BTN = 20
const SHADOW = { color: shadowColor('#00000066'), x: 0, y: 8, blur: 32, spread: 0 }

export default function ClearDataDialog(props) {
  const [cur, setCur] = createSignal(0)
  const cancel = $L('Cancel')
  const words = createMemo(() => {
    const a = props.ask
    return a
      ? { title: a.title, message: a.message, confirm: a.confirm }
      : {
          title: $L('Clear All Data?'),
          message: $L('This will remove all settings, saved servers, and login sessions. You will need to set up the app again.'),
          confirm: $L('Clear All Data'),
        }
  })
  const t = () => theme()
  // The low and mid tiers draw the theme's surface nearly solid instead of the frosted glass.
  const fill = () => (perfTier() === 'high' ? '#1e1e28d9' : withAlpha(t().surface, 0.97))
  // Both colors stay fixed whatever the theme.
  const danger = () => '#c62828ff'
  const lit = () => '#00a4dcff'
  const box = createMemo(() => {
    const w0 = words()
    const widths = [cancel, w0.confirm].map((label) => Math.max(140, textWidth(label, BTN, 'bold') + 80 + 4))
    const buttons = { cancelW: widths[0], confirmW: widths[1], total: widths[0] + 16 + widths[1] }
    // The content is 420 to 520 wide, inside the 48px padding and the 1px border.
    const content = Math.min(520, Math.max(420, textWidth(w0.title, TITLE, 'bold'), textWidth(w0.message, MESSAGE), buttons.total))
    const w = content + 96 + 2
    const lines = lineCount(w0.message, MESSAGE, 'regular', content)
    const titleH = TITLE * 1.172
    const msgH = lines * MESSAGE * 1.172
    const btnH = 28 + BTN * 1.172 + 4
    const h = 2 + 40 + titleH + 12 + msgH + 36 + btnH + 40
    return { w, h, x: (1920 - w) / 2, y: (1080 - h) / 2, msgY: 41 + titleH + 12, btnY: 41 + titleH + 12 + msgH + 36, btnH, buttons }
  })
  const bx = () => (box().w - box().buttons.total) / 2
  const swap = () => {
    setCur(cur() === 0 ? 1 : 0)
    return true
  }
  return (
    <OverNav>
      <view
        ref={props.ref}
        width={1920}
        height={1080}
        color="#00000099"
        onLeft={swap}
        onRight={swap}
        onUp={() => true}
        onDown={() => true}
        onEnter={() => {
          if (cur() === 1) props.onClearDataConfirm()
          else props.onClearDataCancel()
          return true
        }}
        onBack={() => {
          props.onClearDataCancel()
          return true
        }}
      >
        <view x={box().x} y={box().y} width={box().w} height={box().h} borderRadius={24} color="#00000000" shadow={SHADOW} />
        <view x={box().x} y={box().y} width={box().w} height={box().h} borderRadius={24} color={fill()} border={{ width: 1, color: hex('#ffffff1f') }}>
          <view x={24} y={1} width={box().w - 48} height={1} color="#ffffff14" />
          <text fontFamily={uiFont('bold')} fontSize={30} lineHeight={35.16} x={box().w / 2} mountX={0.5} y={43.75} color="#ffffffff">
            {words().title || ' '}
          </text>
          <text
            fontFamily={uiFont()}
            fontSize={20}
            lineHeight={23.44}
            x={49}
            y={box().msgY + 1.84}
            maxWidth={box().w - 98}
            contain="width"
            textAlign="center"
            color="#ffffff99"
          >
            {words().message || ' '}
          </text>
          <view
            x={bx()}
            y={box().btnY}
            width={box().buttons.cancelW}
            height={box().btnH}
            onPointerOver={() => setCur(0)}
            borderRadius={16}
            color={cur() === 0 ? lit() : '#ffffff1a'}
            border={{ width: 2, color: hex(cur() === 0 ? '#ffffffff' : '#00000000') }}
          >
            <text fontFamily={uiFont('bold')} fontSize={20} lineHeight={23.44} x={box().buttons.cancelW / 2} mountX={0.5} y={17.84} color="#ffffffff">
              {cancel}
            </text>
          </view>
          <view
            x={bx() + box().buttons.cancelW + 16}
            y={box().btnY}
            width={box().buttons.confirmW}
            height={box().btnH}
            onPointerOver={() => setCur(1)}
            borderRadius={16}
            color={cur() === 1 ? danger() : '#ffffff1a'}
            border={{ width: 2, color: hex(cur() === 1 ? danger() : '#00000000') }}
          >
            <text fontFamily={uiFont('bold')} fontSize={20} lineHeight={23.44} x={box().buttons.confirmW / 2} mountX={0.5} y={17.84} color="#ffffffff">
              {words().confirm || ' '}
            </text>
          </view>
        </view>
      </view>
    </OverNav>
  )
}
