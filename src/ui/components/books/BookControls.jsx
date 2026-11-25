import { For, Show, createMemo } from 'solid-js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { lineY } from './bookGrid.js'
import { tabBarWidth, tabWidths, textWidth } from './bookText.js'

// These are purely visual. Their holder owns focus and passes `focus` or `focused`.
const CLEAR = '#00000000'
const TAB_GLOW = { color: shadowColor('#ffffff40'), x: 0, y: 0, blur: 14, spread: 1 }
const ring = (w, color) => ({ width: w, color: hex(color) })

// `tabs` is [{ id, label }] and `focus` is the focused index, or -1.
export function TabBar(props) {
  const placed = createMemo(() => {
    const tabs = props.tabs || []
    const widths = tabWidths(tabs, props.active)
    let x = 4
    return tabs.map((tab, i) => {
      const on = tab.id === props.active
      const out = { id: tab.id, label: tab.label, i, x, w: widths[i], on, font: uiFont(on ? 'bold' : 'medium') }
      x += widths[i]
      return out
    })
  })
  const list = keyed(placed, (t) => t.id)
  const barW = () => tabBarWidth(props.tabs || [], props.active)
  const round = (r) => (props.look.t.isPixel ? 0 : r)
  const textY = lineY(3 + (49 - 26.6) / 2, 26.6, 19)
  return (
    <view x={props.x || 0} y={props.y || 0} alpha={props.alpha == null ? 1 : props.alpha} width={barW()} height={63} borderRadius={round(31.5)} color={props.look.os08} clipping>
      <For each={list.keys()}>
        {(k) => {
          const tab = list.item(k)
          const lit = () => props.focus === tab().i
          return (
            <view x={tab().x} y={4} width={tab().w} height={55}>
              <view width={tab().w} height={55} borderRadius={round(27.5)} color={CLEAR} shadow={TAB_GLOW} alpha={lit() ? 1 : 0} />
              <view width={tab().w} height={55} borderRadius={round(27.5)} color={tab().on ? props.look.accent : CLEAR} />
              <view width={tab().w} height={55} borderRadius={round(27.5)} color={CLEAR} border={ring(3, props.look.focus)} alpha={lit() ? 1 : 0} />
              <text fontFamily={tab().font} fontSize={19} x={25} y={textY} color={tab().on ? props.look.onAccent : props.look.os75}>
                {tab().label}
              </text>
            </view>
          )
        }}
      </For>
    </view>
  )
}

// Pills are 55 high, or 46 for See All, which also gets less padding.
export function Pill(props) {
  const ht = () => props.h || 55
  const fs = () => props.size || 19
  const pad = () => (props.h === 46 ? 20 : 24)
  const width = () => Math.ceil(textWidth(props.label, fs(), 'bold')) + pad() * 2 + 6 + (props.icon ? 34 : 0)
  const ink = () => (props.focused ? props.look.buttonInk : props.look.onSurface)
  return (
    <view x={props.x || 0} y={props.y || 0} width={width()} height={ht()} borderRadius={ht() / 2} color={props.focused ? props.look.buttonFocused : props.look.os08}>
      <view width={width()} height={ht()} borderRadius={ht() / 2} color={CLEAR} border={ring(3, props.look.focus)} alpha={props.focused ? 1 : 0} />
      <view>
        <Show when={props.icon}>
          <view
            x={pad() + 3}
            y={(ht() - 24) / 2}
            width={24}
            height={24}
            src={'icons/' + props.icon + '.webp'}
            color={props.iconColor && !props.focused ? props.iconColor : ink()}
          />
        </Show>
      </view>
      <text fontFamily={uiFont('bold')} fontSize={fs()} x={pad() + 3 + (props.icon ? 34 : 0)} y={lineY((ht() - 33) / 2, 33, fs())} color={ink()}>
        {props.label}
      </text>
    </view>
  )
}

// `buttons` come from heroButtons() and `focus` is the focused index, or -1.
export function HeroButtons(props) {
  const list = keyed(() => props.buttons || [], (b) => b.id)
  const textY = lineY(3 + (46 - 33) / 2, 33, 16)
  return (
    <view x={props.x || 0} y={props.y || 0}>
      <For each={list.keys()}>
        {(k) => {
          const b = list.item(k)
          const lit = () => props.focus === b().i
          const ink = () => (lit() ? props.look.buttonInk : b().primary ? props.look.onAccent : '#ffffff')
          return (
            <view x={b().x} width={b().w} height={52}>
              <view width={b().w} height={52} borderRadius={26} color={lit() ? props.look.buttonFocused : b().primary ? props.look.accent : '#ffffff24'} />
              <view width={b().w} height={52} borderRadius={26} color={CLEAR} border={ring(3, props.look.focus)} alpha={lit() ? 1 : 0} />
              <view>
                <Show when={b().icon}>
                  <view
                    x={b().round ? (b().w - 22) / 2 : 24}
                    y={15}
                    width={22}
                    height={22}
                    src={'icons/' + b().icon + '.webp'}
                    color={lit() ? props.look.buttonInk : b().primary ? props.look.onAccent : b().iconColor || '#ffffff'}
                  />
                </Show>
              </view>
              <text fontFamily={b().font} fontSize={16} x={b().icon ? 54 : 24} y={textY} color={ink()}>
                {b().label || ''}
              </text>
            </view>
          )
        }}
      </For>
    </view>
  )
}

// The heading sits on the bottom of a row as tall as the header's controls (`rowH`, 55.2 without
// them), with its count baseline-aligned after it.
export function ScreenTitle(props) {
  const titleY = () => lineY(18 + (props.rowH || 55.2) - 55.2, 55.2, 48)
  // Beside controls starting at `controlsX` the title shrinks to leave them 24px and its count.
  const titleW = () => {
    const w = textWidth(props.title || '', 48, 'bold')
    if (props.controlsX == null) return w
    return Math.max(0, Math.min(w, props.controlsX - 24 - 60 - (props.count ? 20 + textWidth(props.count, 22) : 0)))
  }
  const countX = () => 60 + titleW() + 20
  return (
    <view>
      <text fontFamily={uiFont('bold')} fontSize={48} x={60} y={titleY()} maxWidth={Math.max(1, titleW())} maxLines={1} color={props.look.onSurface}>
        {props.title}
      </text>
      <text fontFamily={uiFont()} fontSize={22} x={countX()} y={titleY() + 23.1} color={props.look.os65}>
        {props.count || ''}
      </text>
    </view>
  )
}
