import { For, Show, createSelector, createSignal } from 'solid-js'
import { fontFor } from '../text.js'

// A vertical list of options (menus, settings rows, track pickers). Each option is
// { id, label, value?, checked? }. It calls onOption(id, option) on Enter and onOptionFocus(id,
// option) as Up and Down move, on its holder, and hands Up past the first and Down past the last
// to the holder. `w` (760) and `maxRows` (10) size it, and it scrolls to keep the focus centered.
const ROW_H = 76

export default function OptionList(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(cur)
  const options = () => props.options || []
  const rows = () => props.maxRows || 10
  const width = () => props.w || 760
  const scroll = () => Math.max(0, Math.min(cur() - Math.floor(rows() / 2), options().length - rows())) * ROW_H
  const current = () => options()[cur()]
  const select = (id) => {
    const i = options().findIndex((o) => o.id === id)
    if (i >= 0) setCur(i)
  }
  const move = (step) => {
    const next = cur() + step
    if (next < 0 || next >= options().length) return false
    setCur(next)
    const o = current()
    if (props.onOptionFocus) props.onOptionFocus(o.id, o)
    return true
  }
  return (
    <view
      ref={(n) => {
        n.select = select
        n.current = current
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={width()}
      height={rows() * ROW_H}
      clipping
      onFocusChanged={setFocused}
      onUp={() => move(-1)}
      onDown={() => move(1)}
      onEnter={() => {
        const o = current()
        if (o && props.onOption) props.onOption(o.id, o)
        return true
      }}
    >
      <view y={-scroll()} width={width()} height={options().length * ROW_H} transition={{ y: { duration: 180 } }}>
        <For each={options()}>
          {(o, i) => {
            const on = () => focused() && isCur(i())
            const value = o.value == null ? '' : String(o.value)
            return (
              <view y={i() * ROW_H} width={width()} height={68} borderRadius={12} color={on() ? '#ffffffff' : '#ffffff0d'}>
                <view>
                  <Show when={o.checked === true}>
                    <view x={20} y={18} width={32} height={32} src="icons/check.webp" color={on() ? '#101010ff' : '#00a4dcff'} />
                  </Show>
                </view>
                <text
                  fontFamily={fontFor(o.label || '', 'medium')}
                  fontSize={27}
                  x={68}
                  y={20}
                  maxWidth={value ? width() - 368 : width() - 92}
                  maxLines={1}
                  color={on() ? '#101010ff' : '#ffffffff'}
                >
                  {o.label || ' '}
                </text>
                <text
                  fontFamily={fontFor(value)}
                  fontSize={24}
                  x={width() - 24}
                  y={22}
                  mountX={1}
                  maxWidth={260}
                  maxLines={1}
                  color={on() ? '#303036ff' : '#a0a0a8ff'}
                >
                  {value || ' '}
                </text>
              </view>
            )
          }}
        </For>
      </view>
    </view>
  )
}
