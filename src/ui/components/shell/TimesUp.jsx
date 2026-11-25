import $L from '../../../services/i18n.js'
import { createMemo, createSignal, onMount } from 'solid-js'
import { theme, shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { cssShadow } from '../account/gradient.js'
import { faceDy, normalLine, textReady, textWidth, themeSpacing, uiFont } from '../../text.js'
import { shell } from '../../../state/shell/shellState.js'

// Shown when the account is outside the hours its server allows. It covers the whole app, and App
// swallows Back and the arrows while it shows, so Switch User is the only way on. Enter calls
// onTimesUpSwitch() on the holder.

// The page under it is four layers of the theme background, so a see-through one ends up almost
// solid over the browser's white.
const pageColor = (bg) => {
  const a = parseInt(bg.slice(7, 9) || 'ff', 16) / 255
  const left = Math.pow(1 - a, 4)
  return [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) * (1 - left) + 255 * left)
}

// radial-gradient(circle at top, rgba(56, 74, 110, 0.45), rgba(2, 8, 20, 0.97)) over that page,
// blended the CSS way (premultiplied) and baked small, which the renderer stretches back smoothly.
const backdrops = {}
const backdropUrl = (bg) => {
  if (backdrops[bg] !== undefined) return backdrops[bg]
  let url = ''
  try {
    const base = pageColor(bg)
    const from = [56, 74, 110, 0.45]
    const to = [2, 8, 20, 0.97]
    const c = document.createElement('canvas')
    c.width = 480
    c.height = 270
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(240, 0, 0, 240, 0, Math.sqrt(240 * 240 + 270 * 270))
    for (let i = 0; i <= 16; i++) {
      const t = i / 16
      const a = from[3] + (to[3] - from[3]) * t
      const ch = (k) => Math.round(from[k] * from[3] + (to[k] * to[3] - from[k] * from[3]) * t + base[k] * (1 - a))
      g.addColorStop(t, `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`)
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 480, 270)
    url = c.toDataURL('image/png')
  } catch (e) {
    url = ''
  }
  backdrops[bg] = url
  return url
}

const CARD_W = 706
// 20.4px of padding and a 1px border around Chrome's normal line for 26.4px text.
const BTN_H = 20.4 * 2 + 2 + normalLine(26.4)

export default function TimesUp(props) {
  const [focused, setFocused] = createSignal(false)
  const [fontsIn, setFontsIn] = createSignal(false)
  onMount(() => textReady().then(() => setFontsIn(true)))
  const label = $L('Switch User')
  // It's drawn in the app's face, so a theme's face moves each line by how it sits.
  const face = createMemo(() => {
    theme()
    return {
      title: uiFont('bold'),
      body: uiFont(),
      spacing: themeSpacing(),
      dy: [faceDy(57.6), faceDy(31.2), faceDy(27.6), faceDy(26.4, true)],
    }
  })
  const box = createMemo(() => {
    fontsIn()
    const btnY = 1 + 40 + 33 + 14 + 33 + (shell.nextAccess ? 10 + 33 : 0) + 30
    const h = btnY + BTN_H + 40 + 1
    const btnW = Math.max(220, textWidth(label, 26.4, 'bold') + 74)
    return { y: (1080 - h) / 2, h, btnY, btnW, btnX: (CARD_W - btnW) / 2 }
  })
  const shadow = () => cssShadow(CARD_W, box().h, 20, { x: 0, y: 24, blur: 50, spread: 0, color: shadowColor('#00000073') })
  const centered = { maxWidth: 640, contain: 'width', textAlign: 'center', lineHeight: 33, color: '#ffffffff' }
  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      alpha={props.show === false ? 0 : 1}
      onFocusChanged={setFocused}
      onEnter={() => {
        if (props.onTimesUpSwitch) props.onTimesUpSwitch()
        return true
      }}
    >
      <view width={1920} height={1080} src={backdropUrl(theme().background)} />
      <view x={607} y={box().y}>
        <view
          x={shadow().x}
          y={shadow().y}
          width={shadow().w}
          height={shadow().h}
          borderRadius={shadow().r}
          color="#00000000"
          shadow={shadow().shadow}
        />
        <view width={CARD_W} height={box().h} borderRadius={20} color="#070e1ee6" border={{ width: 1, color: hex('#ffffff29') }} />
        <text {...centered} fontFamily={face().title} fontSize={57.6} x={33} y={46.5 + face().dy[0]} letterSpacing={face().spacing}>
          {$L("Time's up")}
        </text>
        <text {...centered} fontFamily={face().body} fontSize={31.2} x={33} y={91 + face().dy[1]} letterSpacing={face().spacing} color="#ffffffc2">
          {$L("This account isn't available right now.")}
        </text>
        <text {...centered} fontFamily={face().body} fontSize={27.6} x={33} y={133.5 + face().dy[2]} letterSpacing={face().spacing} color="#ffffffc2">
          {shell.nextAccess || ' '}
        </text>
        <view
          x={box().btnX}
          y={box().btnY}
          width={box().btnW}
          height={72.8}
          borderRadius={12}
          color={focused() ? '#4280f7ff' : '#2b6ae5e6'}
          border={{ width: 1, color: hex(focused() ? '#ffffff99' : '#ffffff33') }}
        >
          <text
            fontFamily={face().title}
            fontSize={26.4}
            x={box().btnW / 2}
            y={25.6 + face().dy[3]}
            mountX={0.5}
            lineHeight={1}
            letterSpacing={face().spacing}
            color="#ffffffff"
          >
            {label}
          </text>
        </view>
      </view>
    </view>
  )
}
