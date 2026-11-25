import { Index, Show, createMemo, createSignal, onMount } from 'solid-js'
import { theme, shadowColor } from '../theme.js'
import { hex } from '../color.js'
import { perfTier } from '../tier.js'
import { cssShadow } from './account/gradient.js'
import { displayFont, fontFor, textReady, themeSpacing, uiFont } from '../text.js'
import { roboto } from './shell/MessageMarkdown.js'
import { OverNav } from '../layers.jsx'
import { alertLayout, cardLayout, dp } from './dialogLayout.js'

const NONE = '#00000000'
const ALERT_SHADOWS = [
  { x: 0, y: dp(3), blur: dp(5), spread: -dp(1), color: '#00000033' },
  { x: 0, y: dp(6), blur: dp(10), spread: 0, color: '#00000024' },
  { x: 0, y: dp(1), blur: dp(18), spread: 0, color: '#0000001f' },
]

// A modal with a title, a message and buttons ({ id, label, primary, destructive }). Its holder
// shows it (mount it, or pass `show`) and focuses it. Enter calls onDialog(id) and Back
// onDialog('cancel') on the holder, and it keeps the arrows. By default it's an alert with text
// buttons along the bottom right in the theme's accent. variant="message" is a centered card with
// one OK that fades and grows in as it takes focus, and variant="exit" is the same card with Cancel
// and Exit, where Left and Right swap between the two.
export default function Dialog(props) {
  const [cur, setCur] = createSignal(0)
  const [opened, setOpened] = createSignal(false)
  const [fontsIn, setFontsIn] = createSignal(false)
  onMount(() => textReady().then(() => setFontsIn(true)))
  const t = () => theme()
  const card = () => props.variant === 'message' || props.variant === 'exit'
  const buttons = () => props.buttons || []
  // Laid out again once the real text widths are in.
  const L = createMemo(() => {
    fontsIn()
    const b = buttons()
    return card() ? cardLayout(props.title || '', props.message || '', b) : alertLayout(props.title || '', props.message || '', b, t())
  })
  const focusBtn = () => L().btns[cur()] || null
  const select = (id) => {
    const i = buttons().findIndex((b) => b.id === id)
    if (i >= 0) setCur(i)
  }
  const answer = (id) => props.onDialog && props.onDialog(id)
  // The Magic Remote's cursor focuses a button, and OK then answers with it (app/pointer.js).
  const point = (i) => () => {
    if (opened() && cur() !== i) setCur(i)
  }
  const step = (dir) => {
    const n = buttons().length
    if (props.variant === 'exit') setCur(n - 1 - cur())
    else setCur(Math.max(0, Math.min(n - 1, cur() + dir)))
    return true
  }
  const spacing = () => themeSpacing()

  const alertRadius = () => (t().isPixel ? 0 : t().isGlass ? dp(20) : dp(16))
  const alertShadows = createMemo(() => ALERT_SHADOWS.map((s) => cssShadow(L().w, L().h, alertRadius(), { ...s, color: shadowColor(s.color) })))
  const Alert = () => (
    <view width={1920} height={1080}>
      <view width={1920} height={1080} color="#0000008a" />
      <view x={L().x} y={L().y}>
        <view>
          <Index each={alertShadows()}>
            {(s) => <view x={s().x} y={s().y} width={s().w} height={s().h} borderRadius={s().r} color={NONE} shadow={s().shadow} />}
          </Index>
        </view>
        <view
          width={L().w}
          height={L().h}
          borderRadius={alertRadius()}
          color={t().surface.slice(0, 7) + 'ff'}
          border={L().bw ? { width: L().bw, color: hex(t().isPixel ? t().surfaceVariant : '#ffffff33') } : undefined}
        />
        <text
          fontFamily={displayFont('regular')}
          fontSize={40.07}
          x={L().inset}
          y={L().titleY}
          lineHeight={53.29}
          maxWidth={L().contentW}
          color={t().textGlow.length ? t().accent : t().onSurface}
          letterSpacing={t().textGlow.length ? 0.4 : 0}
        >
          {props.title || ' '}
        </text>
        <text
          fontFamily={roboto('regular', props.message || '')}
          fontSize={23.374}
          x={L().inset}
          y={L().msgTextY}
          lineHeight={33.42}
          maxWidth={L().contentW + 2}
          color={t().onSurface}
        >
          {props.message || ' '}
        </text>
        <view
          x={focusBtn() ? focusBtn().x : 0}
          y={L().btnY}
          width={focusBtn() ? focusBtn().w : 0}
          height={66.78}
          borderRadius={t().isPixel ? 0 : 33.39}
          color={t().accentA(0.1)}
          alpha={opened() ? 1 : 0}
        />
        <view>
          <Index each={L().btns}>
            {(b) => (
              <text
                onPointerOver={point(b().i)}
                fontFamily={uiFont('medium')}
                fontSize={23.374}
                x={b().x + 20.03}
                y={L().btnTextY}
                lineHeight={1}
                letterSpacing={spacing()}
                color={b().destructive ? '#e57373ff' : t().accent}
              >
                {b().label}
              </text>
            )}
          </Index>
        </view>
      </view>
    </view>
  )

  // The glass blur only runs on the high tier, so the others get the near-solid fill instead.
  const cardFill = () => (perfTier() === 'high' ? '#1e1e28d9' : '#1e1e28f7')
  const cardShadow = createMemo(() => cssShadow(L().w, L().h, 24, { x: 0, y: 8, blur: 32, spread: 0, color: shadowColor('#00000066') }))
  const focusIdx = () => (opened() ? cur() : -1)
  const Card = () => (
    <view width={1920} height={1080} alpha={opened() ? 1 : 0} transition={{ alpha: { duration: 200, easing: 'ease' } }}>
      <view width={1920} height={1080} color="#00000099" />
      <view
        x={L().x}
        y={L().y}
        width={L().w}
        height={L().h}
        pivot={0.5}
        scale={opened() ? 1 : 0.92}
        transition={{ scale: { duration: 200, easing: 'ease' } }}
      >
        <view
          x={cardShadow().x}
          y={cardShadow().y}
          width={cardShadow().w}
          height={cardShadow().h}
          borderRadius={cardShadow().r}
          color={NONE}
          shadow={cardShadow().shadow}
        />
        <view width={L().w} height={L().h} borderRadius={24} color={cardFill()} border={{ width: 1, color: hex('#ffffff1f') }} />
        <view x={20} y={1} width={L().w - 40} height={1} color="#ffffff14" />
        <text
          fontFamily={fontFor(props.title || '', 'bold')}
          fontSize={30}
          x={49}
          y={44 + L().dy.title}
          lineHeight={33}
          maxWidth={L().contentW}
          contain="width"
          textAlign="center"
          letterSpacing={spacing()}
          color="#ffffffff"
        >
          {props.title || ' '}
        </text>
        <text
          fontFamily={fontFor(props.message || '')}
          fontSize={20}
          x={49}
          y={L().msgY + 2 + L().dy.message}
          lineHeight={33}
          maxWidth={L().contentW}
          contain="width"
          textAlign="center"
          letterSpacing={spacing()}
          color="#ffffff99"
        >
          {props.message || ' '}
        </text>
        <view
          x={(focusBtn() ? focusBtn().x : 0) - 1}
          y={L().btnY - 1}
          width={(focusBtn() ? focusBtn().w : 0) + 2}
          height={56}
          borderRadius={17}
          color={NONE}
          border={{ width: 1, color: hex('#ffffff26') }}
          alpha={opened() ? 1 : 0}
        />
        <view>
          <Index each={L().btns}>
            {(b) => {
              const on = () => b().i === focusIdx()
              return (
                <view
                  onPointerOver={point(b().i)}
                  x={b().x}
                  y={L().btnY}
                  width={b().w}
                  height={54}
                  borderRadius={16}
                  color={on() ? (props.variant === 'exit' && b().primary ? '#00b4ecff' : '#00a4dcff') : '#ffffff1a'}
                  border={{ width: 1, color: hex(on() ? '#ffffffff' : NONE) }}
                >
                  <text
                    fontFamily={uiFont('bold')}
                    fontSize={20}
                    x={b().w / 2}
                    y={19 + L().dy.btn}
                    mountX={0.5}
                    lineHeight={1}
                    letterSpacing={spacing()}
                    color="#ffffffff"
                  >
                    {b().label}
                  </text>
                </view>
              )
            }}
          </Index>
        </view>
      </view>
    </view>
  )

  return (
    <OverNav>
      <view
        ref={(n) => {
          n.select = select
          if (props.ref) props.ref(n)
        }}
        width={1920}
        height={1080}
        alpha={props.show === false ? 0 : 1}
        pointerModal
        onFocusChanged={setOpened}
        onLeft={() => step(-1)}
        onRight={() => step(1)}
        onUp={() => true}
        onDown={() => true}
        onEnter={() => {
          const b = buttons()[cur()]
          if (b) answer(b.id)
          return true
        }}
        onBack={() => {
          answer('cancel')
          return true
        }}
      >
        <Show when={card()} fallback={<Alert />}>
          <Card />
        </Show>
      </view>
    </OverNav>
  )
}
