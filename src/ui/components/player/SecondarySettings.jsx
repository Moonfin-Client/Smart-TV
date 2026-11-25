import $L from '../../../services/i18n.js'
import { Index, createMemo, createSignal, onCleanup } from 'solid-js'
import { uiFont } from '../../text.js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { accent, white } from './look.js'
import { SECONDARY_OFFSET_MAX, SECONDARY_SIZE_MAX, SECONDARY_SIZE_MIN } from '../../../pages/Player/secondarySubtitle.js'
import { tx } from '../../fx.js'

// The second subtitle track's settings: size, vertical offset and color, with sliders. Focus is the
// default blue, not the theme's. Props `size`, `offset` and `colorLabel`. It calls
// onSecondaryStep(key, dir) and closePanel() on its holder, which mounts it and calls open().
const ITEMS = [157.1, 299.1]
const KEYS = ['secondarySubtitleSize', 'secondarySubtitleOffset', 'secondarySubtitleColor', 'close']
const SHADOW = { color: shadowColor('#000000cc'), x: 0, y: 15, blur: 50, spread: 0 }
const KNOB_SHADOW = { color: shadowColor('#00000080'), x: 0, y: 3, blur: 6, spread: 0 }
const EDGE = { width: 1, color: hex('#ffffff26') }
const FOCUS_EDGE = { width: 1, color: hex('#00a4dc') }
const FADE = { duration: 200 }

export default function SecondarySettings(props) {
  const [cur, setCur] = createSignal(0)
  const [on, setOn] = createSignal(false)
  const [active, setActive] = createSignal(false)
  const title = $L('Secondary Subtitle Track')
  const sizeLabel = $L('Subtitle Size')
  const offsetLabel = $L('Vertical Offset')
  const colorName = $L('Text Fill Color')
  const closeLabel = $L('Press BACK to close')
  const titleFont = uiFont('bold')
  const labelFont = uiFont('medium')
  const valueFont = uiFont('bold')
  const closeFont = uiFont()
  let timer = null
  onCleanup(() => clearTimeout(timer))

  const sliders = createMemo(() => {
    const size = props.size
    const offset = props.offset
    const lit = active() ? cur() : -1
    return [
      { y: ITEMS[0], label: sizeLabel, value: String(size), f: (size - SECONDARY_SIZE_MIN) / (SECONDARY_SIZE_MAX - SECONDARY_SIZE_MIN), on: lit === 0 },
      { y: ITEMS[1], label: offsetLabel, value: `${offset}%`, f: offset / SECONDARY_OFFSET_MAX, on: lit === 1 },
    ].map((s) => ({ ...s, f: Math.max(0, Math.min(1, s.f || 0)), bg: s.on ? accent(0.15) : white(0.08), tone: s.on ? '#e6e6e6ff' : '#8d9298ff' }))
  })
  const colorOn = () => active() && cur() === 2
  const closeOn = () => active() && cur() === 3

  // Focus starts on the size slider and the panel fades and slides in.
  const open = () => {
    setCur(0)
    setOn(false)
    clearTimeout(timer)
    timer = setTimeout(() => setOn(true), 16)
  }
  const stepKey = (i, dir) => {
    if (props.onSecondaryStep) props.onSecondaryStep(KEYS[i], dir)
  }

  return (
    <view
      ref={(n) => {
        n.open = open
        if (props.ref) props.ref(n)
      }}
      width={1920}
      pointerModal
      height={1080}
      transition={tx({ alpha: { duration: on() ? 200 : 0, easing: 'ease' } })}
      alpha={on() ? 1 : 0}
      onFocusChanged={setActive}
      onUp={() => {
        if (cur() > 0) setCur(cur() - 1)
        return true
      }}
      onDown={() => {
        if (cur() < 3) setCur(cur() + 1)
        return true
      }}
      onLeft={() => {
        if (cur() < 2) stepKey(cur(), -1)
        return true
      }}
      onRight={() => {
        if (cur() < 2) stepKey(cur(), 1)
        return true
      }}
      onEnter={() => {
        if (cur() === 2) stepKey(2, 1)
        else if (cur() === 3 && props.closePanel) props.closePanel()
        return true
      }}
    >
      <view width={1920} height={1080} color="#000000f2" />
      <view
        x={559}
        transition={tx({ y: { duration: on() ? 300 : 0, easing: 'ease' }, alpha: { duration: on() ? 300 : 0, easing: 'ease' } })}
        y={231 + (on() ? 0 : 30)}
        alpha={on() ? 1 : 0}
        width={802}
        height={618.1}
      >
        <view width={802} height={618.1} borderRadius={16} color="#00000000" shadow={SHADOW} />
        <view width={802} height={618.1} borderRadius={16} color="#1e1e1efa" border={EDGE} />
        <text fontFamily={titleFont} fontSize={40} x={401} y={81.16} mountX={0.5} color="#ffffffff">
          {title}
        </text>

        <view>
          <Index each={sliders()}>
            {(s, i) => (
              // The Magic Remote's cursor focuses a row, and OK then uses it (app/pointer.js).
              <view x={61} y={s().y} width={680} height={122} onPointerOver={() => cur() !== i && setCur(i)}>
                <view width={680} height={122} borderRadius={10} transition={{ color: FADE }} color={s().bg} />
                <view width={680} height={122} borderRadius={10} color="#00000000" border={EDGE} />
                <view width={680} height={122} borderRadius={10} color="#00000000" border={FOCUS_EDGE} transition={{ alpha: FADE }} alpha={s().on ? 1 : 0} />
                <text fontFamily={labelFont} fontSize={24} x={31} y={20.44} color="#ffffffff">
                  {s().label}
                </text>
                <text fontFamily={valueFont} fontSize={24} x={649} y={20.44} mountX={1} color="#00a4dcff">
                  {s().value}
                </text>
                <view x={67} y={82} width={546} height={6} borderRadius={3} color="#373a41ff" />
                <view x={67} y={82} width={546 * s().f} height={6} borderRadius={3} color={s().tone} />
                <view x={67 + 546 * s().f - 7} y={78} width={14} height={14} borderRadius={7} color="#8d9298ff" alpha={s().on ? 0 : 1} />
                <view x={67 + 546 * s().f - 10} y={75} width={20} height={20} borderRadius={10} color="#00000000" shadow={KNOB_SHADOW} alpha={s().on ? 1 : 0} />
                <view x={67 + 546 * s().f - 10} y={75} width={20} height={20} borderRadius={10} color="#e6e6e6ff" alpha={s().on ? 1 : 0} />
              </view>
            )}
          </Index>
        </view>

        <view x={61} y={441.1} width={680} height={70} transition={{ scale: FADE }} scale={colorOn() ? 1.02 : 1} onPointerOver={() => cur() !== 2 && setCur(2)}>
          <view width={680} height={70} borderRadius={10} transition={{ color: FADE }} color={colorOn() ? '#00a4dc4d' : '#ffffff14'} />
          <view width={680} height={70} borderRadius={10} color="#00000000" border={EDGE} />
          <view width={680} height={70} borderRadius={10} color="#00000000" border={FOCUS_EDGE} transition={{ alpha: FADE }} alpha={colorOn() ? 1 : 0} />
          <text fontFamily={labelFont} fontSize={24} x={31} y={22.94} color="#ffffffff">
            {colorName}
          </text>
          <text fontFamily={valueFont} fontSize={24} x={649} y={22.94} mountX={1} color="#00a4dcff">
            {props.colorLabel || ' '}
          </text>
        </view>

        <view x={51} y={526} width={700} height={41} borderRadius={4} color={closeOn() ? '#ffffff1a' : '#00000000'} onPointerOver={() => cur() !== 3 && setCur(3)}>
          <text fontFamily={closeFont} fontSize={18} x={350} y={11.95} mountX={0.5} color={closeOn() ? '#ffffffff' : '#ffffff99'}>
            {closeLabel}
          </text>
        </view>
      </view>
    </view>
  )
}
