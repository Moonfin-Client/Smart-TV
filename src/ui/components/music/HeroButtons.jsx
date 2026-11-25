import { For, Show, createSelector } from 'solid-js'
import { lineY } from '../books/bookGrid.js'
import { uiFont, textWidth } from '../../text.js'
import { hex } from '../../color.js'

const H = 52
const GAP = 10
const NONE = '#00000000'

export const heroButtons = (list) => {
  let x = 0
  return list.map((b, i) => {
    const textW = b.label ? textWidth(b.label, 16, 'bold') : 0
    const w = b.round ? H : Math.ceil(24 + 22 + (b.label ? 8 + textW : 0) + 24)
    const out = { ...b, k: b.id, i, x, w }
    x += w + GAP
    return out
  })
}
const heroButtonsWidth = (placed) => (placed.length ? placed[placed.length - 1].x + placed[placed.length - 1].w : 0)

function Pill(props) {
  const look = () => props.look
  const b = () => props.btn
  const fill = () => {
    if (props.focused) return look().buttonFocused
    return b().primary ? look().accent : look().os(0.14)
  }
  const ink = () => {
    if (props.focused) return look().buttonInk
    if (b().on) return look().accent
    return b().primary ? look().onAccent : '#ffffffff'
  }
  return (
    <view x={b().x} width={b().w} height={H}>
      <view width={b().w} height={H} borderRadius={26} color={fill()} />
      <view width={b().w} height={H} borderRadius={26} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={props.focused ? 1 : 0} />
      <view x={b().round ? 15 : 24} y={15} width={22} height={22} src={'icons/' + b().icon + '.webp'} color={ink()} />
      <view>
        <Show when={b().label}>
          <text fontFamily={uiFont('bold')} fontSize={16} x={54} y={lineY((H - 33) / 2, 33, 16)} color={ink()}>
            {b().label}
          </text>
        </Show>
      </view>
    </view>
  )
}

// The screen owns focus and passes `focus`, the focused button's index or -1.
export default function HeroButtons(props) {
  const isFocused = createSelector(() => props.focus)
  return (
    <view x={props.x || 0} y={props.y || 0} width={heroButtonsWidth(props.buttons || [])} height={H}>
      <For each={props.buttons}>{(btn) => <Pill btn={btn} look={props.look} focused={isFocused(btn.i)} />}</For>
    </view>
  )
}
