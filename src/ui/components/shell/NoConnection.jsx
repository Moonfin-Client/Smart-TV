import $L from '../../../services/i18n.js'
import { createMemo, createSignal, onMount } from 'solid-js'
import { theme } from '../../theme.js'
import { hex } from '../../color.js'
import { faceDy, textReady, textWidth, themeSpacing, uiFont } from '../../text.js'
import { gradientUrl } from '../previews/mediaBarKit.js'
import { checkOffline } from '../../../state/shell/connection.js'
import { shell } from '../../../state/shell/shellState.js'

// When the TV says it's offline and the server doesn't answer either, the whole app gives way to
// this until Retry, or the TV coming back online, says otherwise. Its colors stay the same on every
// theme. It takes focus as it appears, and nothing behind it can be reached while it's up.
export default function NoConnection(props) {
  const [focused, setFocused] = createSignal(false)
  const [fontsIn, setFontsIn] = createSignal(false)
  let root
  onMount(() => {
    root.setFocus()
    textReady().then(() => setFontsIn(true))
  })
  const background = gradientUrl({ w: 1920, h: 1080, angle: 135, stops: [['#0a0a1e', 0], ['#1a1a3a', 0.5], ['#0f1b3d', 1]] })
  const retry = $L('Retry')
  const face = createMemo(() => {
    theme()
    return { title: uiFont('bold'), body: uiFont(), spacing: themeSpacing(), dy: [faceDy(48), faceDy(28), faceDy(28, true)] }
  })
  const retryW = createMemo(() => {
    fontsIn()
    return textWidth(retry, 28) + 98
  })
  const centered = { maxWidth: 1920, contain: 'width', textAlign: 'center', lineHeight: 33 }
  return (
    <view
      ref={(n) => {
        root = n
        if (props.ref) props.ref(n)
      }}
      width={1920}
      // A click with the Magic Remote's cursor is its one action, as OK is (app/pointer.js).
      onPointerClick={() => true}
      height={1080}
      onFocusChanged={setFocused}
      onEnter={() => {
        checkOffline()
        return true
      }}
      onKeyPress={() => true}
    >
      <view width={1920} height={1080} src={background} />
      <view x={900} y={362.5} width={120} height={120} src="icons/noConnection.webp" color="#ffffff66" />
      <text {...centered} fontFamily={face().title} fontSize={48} y={525 + face().dy[0]} letterSpacing={face().spacing} color="#ffffffff">
        {$L('No Internet Connection')}
      </text>
      <text {...centered} fontFamily={face().body} fontSize={28} y={572 + face().dy[1]} letterSpacing={face().spacing} color="#ffffff99">
        {$L('Check your network settings and try again.')}
      </text>
      <view
        x={(1920 - retryW()) / 2}
        y={650.5}
        width={retryW()}
        height={67}
        borderRadius={8}
        color={focused() ? '#00a4dc66' : '#ffffff1a'}
        border={{ width: 1, color: hex(focused() ? '#00a4dcff' : '#ffffff4d') }}
      >
        <text
          fontFamily={face().body}
          fontSize={28}
          x={retryW() / 2}
          y={22 + face().dy[2]}
          mountX={0.5}
          lineHeight={1}
          letterSpacing={face().spacing}
          color="#ffffffff"
        >
          {retry}
        </text>
      </view>
    </view>
  )
}

// App's banner over the top of the screen while the signed-in server can't be reached. Its Retry
// is drawn but never takes focus.
export function ConnectionBanner(props) {
  const [fontsIn, setFontsIn] = createSignal(false)
  onMount(() => textReady().then(() => setFontsIn(true)))
  const retry = $L('Retry')
  const down = () => shell.connection === 'disconnected'
  const face = createMemo(() => {
    theme()
    return { font: uiFont(), spacing: themeSpacing(), dy: [faceDy(24), faceDy(20, true)] }
  })
  const text = () => (down() ? $L('Lost connection to server') : $L('Reconnecting to server...'))
  const bar = createMemo(() => {
    fontsIn()
    face()
    const textW = textWidth(text(), 24)
    const btnW = down() ? textWidth(retry, 20) + 42 : 0
    const total = textW + (down() ? 16 + btnW : 0)
    return { h: down() ? 62 : 57, textX: (1920 - total) / 2, btnX: (1920 + total) / 2 - btnW, btnW }
  })
  return (
    <view width={1920} height={bar().h} color="#c83232e6" alpha={props.show ? 1 : 0}>
      <text
        fontFamily={face().font}
        fontSize={24}
        x={bar().textX}
        y={(bar().h - 33) / 2 + 2 + face().dy[0]}
        lineHeight={33}
        letterSpacing={face().spacing}
        color="#ffffffff"
      >
        {text()}
      </text>
      <view
        x={bar().btnX}
        y={12}
        width={bar().btnW}
        height={38}
        borderRadius={4}
        color="#ffffff33"
        border={{ width: 1, color: hex('#ffffff80') }}
        alpha={down() ? 1 : 0}
      >
        <text
          fontFamily={face().font}
          fontSize={20}
          x={bar().btnW / 2}
          y={11 + face().dy[1]}
          mountX={0.5}
          lineHeight={1}
          letterSpacing={face().spacing}
          color="#ffffffff"
        >
          {retry}
        </text>
      </view>
    </view>
  )
}
