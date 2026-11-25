import $L from '../../../services/i18n.js'
import { createMemo, createSignal } from 'solid-js'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { lineCount } from './look.js'
import { panelFill, panelShadow, promptColors } from './overlayLook.js'

const W = 522
const INNER = W - 70

// The Still Watching card: 522 wide, centered over a 60 percent scrim, with the eye, the question
// and Continue over Stop. Up and Down move between the two, and Enter calls
// onDialog('continue' | 'stop') on its holder. Back goes on to the holder, which answers it as
// Continue. `show` draws it.
export default function StillWatchingDialog(props) {
  const [cur, setCur] = createSignal(0)
  const [active, setActive] = createSignal(false)
  const title = $L('Still Watching?')
  const body = $L('Playback has been paused. Are you still watching?')
  const continueLabel = $L('Continue')
  const stopLabel = $L('Stop')
  const bold = uiFont('bold')
  const regular = uiFont()
  const fill = panelFill()
  const c = promptColors()
  const shadow = panelShadow(0.5)
  const look = createMemo(() => {
    const lines = Math.max(1, lineCount(body, 20, 'regular', INNER))
    // The icon is 78 inside its border, the buttons a 25 line box inside 19 or 16 of padding and a border.
    const bodyY = 38 + 80 + 23 + 33 + 12
    const continueY = bodyY + lines * 30 + 35
    const stopY = continueY + 65 + 14
    const h = stopY + 59 + 35
    return { x: (1920 - W) / 2, y: Math.round((1080 - h) / 2), h, lines, bodyY, continueY, stopY }
  })
  const onContinue = () => active() && cur() === 0
  const onStop = () => active() && cur() === 1
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      width={1920}
      height={1080}
      alpha={props.show ? 1 : 0}
      onFocusChanged={(has) => {
        if (has) setCur(0)
        setActive(has)
      }}
      onUp={() => {
        setCur(0)
        return true
      }}
      onDown={() => {
        setCur(1)
        return true
      }}
      onLeft={() => true}
      onRight={() => true}
      onEnter={() => {
        if (props.onDialog) props.onDialog(cur() === 0 ? 'continue' : 'stop')
        return true
      }}
    >
      <view width={1920} height={1080} color="#00000099" />
      <view x={look().x} y={look().y}>
        <view width={W} height={look().h} borderRadius={35} color="#00000000" shadow={shadow} />
        <view width={W} height={look().h} borderRadius={35} color={fill} />
        <view x={221} y={38} width={80} height={80} borderRadius={40} color={c.accentA(0.16)} border={{ width: 1, color: hex(c.accentA(0.4)) }}>
          <view x={21} y={21} width={38} height={38} src="icons/player_still_watching.webp" color={c.accent} />
        </view>
        <text fontFamily={bold} fontSize={28} x={261} y={143} lineHeight={33} mountX={0.5} color={c.text}>
          {title}
        </text>
        <text
          fontFamily={regular}
          fontSize={20}
          x={35}
          y={look().bodyY + 1}
          lineHeight={30}
          maxWidth={INNER}
          maxLines={look().lines}
          contain="width"
          textAlign="center"
          color={c.os(0.62)}
        >
          {body}
        </text>
        <view x={35} y={look().continueY} width={INNER} height={65}>
          <view width={INNER} height={65} borderRadius={20} color={c.accent} />
          <view width={INNER} height={65} borderRadius={20} color="#00000000" border={{ width: 1, color: hex(c.accentButtonFocus) }} alpha={onContinue() ? 1 : 0} />
          <text fontFamily={bold} fontSize={22} x={226} y={22} lineHeight={25} mountX={0.5} color={c.onAccent}>
            {continueLabel}
          </text>
        </view>
        <view x={35} y={look().stopY} width={INNER} height={59}>
          <view width={INNER} height={59} borderRadius={20} color="#00000000" border={{ width: 1, color: hex(c.focus) }} alpha={onStop() ? 1 : 0} />
          <text fontFamily={regular} fontSize={22} x={226} y={19} lineHeight={25} mountX={0.5} color={onStop() ? c.text : c.os(0.6)}>
            {stopLabel}
          </text>
        </view>
      </view>
    </view>
  )
}
