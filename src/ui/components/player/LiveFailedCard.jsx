import $L from '../../../services/i18n.js'
import { createMemo, createSignal } from 'solid-js'
import Button from '../Button.jsx'
import { fontFor, textWidth } from '../../text.js'
import { hex } from '../../color.js'

// A channel that can't play says so in a card centered over the player, with Retry, which takes
// focus whenever the card shows so OK retries. The holder passes the `message` ('Failed to play
// {name}') and `show`, and hears onDialog('retry'), and openCarousel() for Up, which opens the
// channel carousel over the card. Back goes on to the holder. The card is 1px of border and 32px of
// padding around the 33px message line, a 24px gap and the 72px button, at least 270 wide.
export default function LiveFailedCard(props) {
  const [active, setActive] = createSignal(false)
  const retry = $L('Retry')
  const messageFont = () => fontFor(props.message || '', 'bold')
  const look = createMemo(() => {
    const msgW = textWidth(props.message || '', 32, 'bold')
    const inner = Math.max(msgW, 270)
    const w = inner + 66
    return { x: (1920 - w) / 2, w, msgX: 33 + (inner - msgW) / 2, btnX: 33 + (inner - 270) / 2 }
  })
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      width={1920}
      height={1080}
      alpha={props.show ? 1 : 0}
      onFocusChanged={setActive}
      onEnter={() => {
        if (props.onDialog) props.onDialog('retry')
        return true
      }}
      onUp={() => {
        if (props.openCarousel) props.openCarousel()
        return true
      }}
      onDown={() => true}
      onLeft={() => true}
      onRight={() => true}
    >
      <view x={look().x} y={439.5} width={look().w} height={201}>
        <view width={look().w} height={201} borderRadius={28} color="#000000de" border={{ width: 1, color: hex('#ffffff1a') }} />
        <text fontFamily={messageFont()} fontSize={32} lineHeight={33} x={look().msgX} y={36} color="#ffffffff">
          {props.message || ' '}
        </text>
        <Button x={look().btnX} y={93} w={270} label={retry} neutral focused={active()} />
      </view>
    </view>
  )
}
