import { Show } from 'solid-js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'

// One row of a LibraryPanel dialog, drawn from its laid out model. Optional parts exist only when the
// row needs them. `neon` draws Neon Pulse: option rows focused and picked in the accent, a picked
// radio filled with it, and the headings cyan.
const ON = '#ffffff'
const OFF = '#ffffffcc'
const CLEAR = '#00000000'
const DIM_EDGE = { width: 1, color: hex('#ffffff59') }
const OPTION = { check: 1, radio: 1, clear: 1, more: 1 }
const NEON_EDGE = { width: 1, color: hex('#ff2e92') }
const NEON_CYAN = '#00e5ff'

export default function PanelRow(props) {
  // The accent marks what's picked, and the search field's ring is the focus color.
  const t = theme()
  const ACCENT_EDGE = { width: 1, color: hex(t.accent) }
  const FIELD_EDGE = { width: 3, color: hex(t.focus) }
  const r = () => props.r
  const k = () => r().kind
  const on = () => !!props.focused
  const labelX = () => (k() === 'clear' ? 49 : k() === 'more' ? 17 : 55)
  const labelColor = () => (k() === 'clear' ? t.accent : r().checked || r().selected || on() ? ON : OFF)
  return (
    <view x={25} y={r().y}>
      <Show when={k() === 'line'}>
        <view width={r().inner} height={1} color="#ffffff1f" />
      </Show>
      <Show when={OPTION[k()]}>
        <view width={r().inner} height={54} borderRadius={8} color={props.neon && on() ? '#ff2e9226' : props.neon && (r().checked || r().selected) ? '#ff2e921f' : '#ffffff1a'} />
      </Show>
      <Show when={k() === 'section'}>
        <view width={r().inner} height={48} borderRadius={8} color="#ffffff1a" alpha={on() ? 1 : 0} />
      </Show>
      <Show when={r().focusable && k() !== 'search'}>
        <view width={r().inner} height={r().h} borderRadius={8} color={CLEAR} border={props.neon && OPTION[k()] ? NEON_EDGE : ACCENT_EDGE} alpha={on() ? 1 : 0} />
      </Show>
      <Show when={k() === 'check'}>
        <Show
          when={r().checked}
          fallback={<view x={17} y={15} width={24} height={24} borderRadius={4} color={CLEAR} border={DIM_EDGE} />}
        >
          <view x={17} y={15} width={24} height={24} borderRadius={4} color={t.accent}>
            <view x={4} y={4} width={16} height={16} src="icons/lib_check.webp" color={t.onAccent} />
          </view>
        </Show>
      </Show>
      <Show when={k() === 'radio'}>
        <Show
          when={r().selected}
          fallback={<view x={17} y={15} width={24} height={24} borderRadius={12} color={CLEAR} border={DIM_EDGE} />}
        >
          <view x={17} y={15} width={24} height={24} borderRadius={12} color={CLEAR} border={ACCENT_EDGE}>
            <view x={6} y={6} width={12} height={12} borderRadius={6} color={t.accent} />
          </view>
        </Show>
      </Show>
      <Show when={k() === 'clear'}>
        <view x={17} y={18} width={18} height={18} src="icons/lib_clear_filters.webp" color={t.accent} />
      </Show>
      <Show when={OPTION[k()]}>
        <text
          fontFamily={r().labelFont}
          fontSize={18}
          x={labelX()}
          y={16.5}
          lineHeight={21}
          maxWidth={r().inner - 110}
          maxLines={1}
          color={labelColor()}
        >
          {r().labelText}
        </text>
      </Show>
      <Show when={k() === 'radio' && r().arrow}>
        <view x={r().inner - 37} y={17} width={20} height={20} src={'icons/' + r().arrow + '.webp'} color={t.accent} />
      </Show>
      <Show when={k() === 'section'}>
        <text
          fontFamily={r().labelFont}
          fontSize={19}
          x={13}
          y={12.5}
          lineHeight={23}
          maxWidth={r().inner - 80}
          maxLines={1}
          color={r().open || on() ? '#ffffff' : props.neon ? NEON_CYAN : '#ffffffb8'}
        >
          {r().labelText}
        </text>
        <Show when={r().summaryText}>
          <text
            fontFamily={r().sumFont}
            fontSize={19}
            x={r().summaryX}
            y={12.5}
            lineHeight={23}
            maxWidth={r().inner * 0.45 - 24}
            maxLines={1}
            color={t.accent}
          >
            {r().summaryText}
          </text>
        </Show>
        <view
          x={r().inner - 39}
          y={11}
          width={26}
          height={26}
          src={r().open ? 'icons/lib_expand_less.webp' : 'icons/lib_expand_more.webp'}
          color={on() ? '#ffffff' : '#ffffffb8'}
        />
      </Show>
      <Show when={k() === 'heading'}>
        <text fontFamily={r().labelFont} fontSize={19} x={16} y={20} lineHeight={33} color={props.neon ? NEON_CYAN : '#ffffffb8'}>
          {r().labelText}
        </text>
      </Show>
      <Show when={k() === 'search'}>
        <view width={r().inner} height={66} borderRadius={33} color="#1e1e28b8">
          <view width={r().inner} height={66} borderRadius={33} color={CLEAR} border={FIELD_EDGE} alpha={on() ? 1 : 0} />
          <view x={20} y={19} width={28} height={28} src="icons/lib_search.webp" color="#ffffff" />
          <text
            fontFamily={r().labelFont}
            fontSize={25}
            x={61}
            y={16.5}
            lineHeight={33}
            maxWidth={r().inner - 84}
            maxLines={1}
            color={r().filled ? '#ffffff' : '#ffffff9e'}
          >
            {r().labelText}
          </text>
        </view>
      </Show>
      <Show when={k() === 'note'}>
        <text fontFamily={r().labelFont} fontSize={15} x={16} y={12} color="#ffffff73">
          {r().labelText}
        </text>
      </Show>
    </view>
  )
}
