import { For, Show, createMemo } from 'solid-js'
import MusicTabBar from './MusicTabBar.jsx'
import { tabBarWidth, tabWidths } from '../books/bookText.js'
import { lineY } from '../books/bookGrid.js'
import { uiFont, fontFor, textWidth } from '../../text.js'
import { hex } from '../../color.js'
import { contentWidth } from './musicGrid.js'

export { cardSide, gridRows, rowIndexOf, gridMove, keepInView, contentWidth } from './musicGrid.js'

const NONE = '#00000000'

export { clampText } from '../details/measure.js'

// A pill's width: its 3px border and 24px sides round a 24px glyph, a 10px gap and its label.
const pillWidth = (label, icon) => Math.ceil(3 + 24 + (icon ? 34 : 0) + textWidth(label, 19, 'bold') + 24 + 3)

// The header's controls laid out from the right edge, each with its stops. `controls` is
// [{kind: 'tabs', tabs, active} | {kind: 'pill', id, label, icon, primary, accentIcon}].
export const layoutControls = (controls, right = contentWidth() - 60) => {
  const widths = controls.map((c) => (c.kind === 'tabs' ? tabBarWidth(c.tabs, c.active) : pillWidth(c.label, c.icon)))
  const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, controls.length - 1) * 15
  let x = right - total
  const stops = []
  const placed = controls.map((c, i) => {
    const out = { ...c, k: c.id || c.kind + i, i, x, w: widths[i], h: c.kind === 'tabs' ? 63 : 55 }
    if (c.kind === 'tabs') {
      let tx = x + 4
      tabWidths(c.tabs, c.active).forEach((tw, t) => {
        stops.push({ ctrl: i, tab: t, x: tx, w: tw, id: c.tabs[t].id })
        tx += tw
      })
    } else stops.push({ ctrl: i, tab: -1, x, w: out.w, id: c.id })
    x += widths[i] + 15
    return out
  })
  return { placed, stops, x: right - total, h: placed.reduce((h, c) => Math.max(h, c.h), 0) }
}

function Pill(props) {
  const look = () => props.look
  const p = () => props.pill
  const fill = () => {
    if (props.focused) return look().buttonFocused
    return p().primary ? look().accent : look().os(0.08)
  }
  const ink = () => {
    if (props.focused) return look().buttonInk
    return p().primary ? look().onAccent : '#ffffffff'
  }
  return (
    <view x={props.x || 0} y={props.y || 0} width={p().w} height={55}>
      <view width={p().w} height={55} borderRadius={27.5} color={fill()} />
      <view width={p().w} height={55} borderRadius={27.5} color={NONE} border={{ width: 3, color: hex(look().focus) }} alpha={props.focused ? 1 : 0} />
      <view>
        <Show when={p().icon}>
          <view x={27} y={15.5} width={24} height={24} src={'icons/' + p().icon + '.webp'} color={p().accentIcon && !props.focused ? look().accent : ink()} />
        </Show>
      </view>
      <text fontFamily={fontFor(p().label, 'bold')} fontSize={19} x={p().icon ? 61 : 27} y={lineY((55 - 33) / 2, 33, 19)} color={ink()}>
        {p().label}
      </text>
    </view>
  )
}

export const headerHeight = (controls, extra) => 18 + Math.max(extra ? 63 : 55.2, layoutControls(controls || []).h)

// `focus` indexes the extra tabs and then layoutControls().stops, or is -1. `extra` is a tab bar
// beside the title ({tabs, active}), and `left` is the title's x.
export function ScreenHeader(props) {
  const look = () => props.look
  const left = () => props.left || 60
  const lay = createMemo(() => layoutControls(props.controls || []))
  // A tab bar beside the title centers the title line on it.
  const lineH = () => (props.extra ? 63 : 55.2)
  const h = () => Math.max(lineH(), lay().h)
  const titleTop = () => 18 + h() - lineH() + (lineH() - 55.2) / 2
  const extraCount = () => (props.extra ? props.extra.tabs.length : 0)
  const extraFocus = () => (props.focus >= 0 && props.focus < extraCount() ? props.focus : -1)
  const titleW = () => Math.ceil(textWidth(props.title, 48, 'bold'))
  const stop = () => lay().stops[props.focus - extraCount()] || null
  const focusOf = (c) => {
    const s = stop()
    return s && s.ctrl === c.i ? (c.kind === 'tabs' ? s.tab : 0) : -1
  }
  return (
    <view width={contentWidth()} height={18 + h()}>
      <text fontFamily={uiFont('bold')} fontSize={48} x={left()} y={titleTop() + 1} color={look().onSurface}>
        {props.title}
      </text>
      <view>
        <Show when={props.count}>
          <text fontFamily={uiFont()} fontSize={22} x={left() + titleW() + 20} y={titleTop() + 20 + 4.6} color={look().os(0.65)}>
            {props.count}
          </text>
        </Show>
      </view>
      <view>
        <Show when={props.extra && props.extra.tabs.length}>
          <MusicTabBar x={left() + titleW() + 36} y={18 + h() - lineH()} tabs={props.extra.tabs} active={props.extra.active} focus={extraFocus()} look={look()} />
        </Show>
      </view>
      <view>
        <For each={lay().placed}>
          {(c) => (
            <view x={c.x} y={18 + h() - lay().h}>
              {c.kind === 'tabs' ? (
                <MusicTabBar tabs={c.tabs} active={c.active} focus={focusOf(c)} look={look()} />
              ) : (
                <Pill y={lay().h > 55 ? (lay().h - 55) / 2 : 0} pill={c} focused={focusOf(c) === 0} look={look()} />
              )}
            </view>
          )}
        </For>
      </view>
    </view>
  )
}
