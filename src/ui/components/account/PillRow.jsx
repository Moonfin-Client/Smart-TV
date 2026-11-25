import { For, createMemo, createSelector, createSignal, onMount } from 'solid-js'
import { textReady, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { motion, textWidth } from './look.js'

// Outlined pills centered across the screen, 12dp apart. `pills` are {id, label, icon, danger},
// `colors` {accent, base}. It owns Left, Right and Enter, calls onPill(id) on the holder and hands
// Up and Down to it. Its node has select(id) and laid() (each pill's { key, x, w }), which the
// holder uses to aim Down at the pill nearest a point.
const H = 73.471
const BORDER = 3
const PAD = 33.391
const ICON = 30.052
const ICON_GAP = 13.357
const GAP = 20.035
const FONT = 25.044
const NONE = '#00000000'

export default function PillRow(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const [measured, setMeasured] = createSignal(0)
  onMount(() => textReady().then(() => setMeasured(measured() + 1)))
  const isCur = createSelector(() => (focused() ? cur() : -1))
  const font = () => uiFont('medium')
  const pills = () => props.pills || []
  const c = () => props.colors || { accent: '#00a4dc', base: '#ffffff' }
  const laid = createMemo(() => {
    measured()
    const list = pills().map((p) => ({ p, w: 2 * BORDER + 2 * PAD + (p.icon ? ICON + ICON_GAP : 0) + textWidth(p.label, FONT, 'medium') }))
    const total = list.reduce((sum, item) => sum + item.w, 0) + Math.max(0, list.length - 1) * GAP
    let x = 960 - total / 2
    const at = {}
    list.forEach(({ p, w }) => {
      at[p.id] = { key: p.id, x, w }
      x += w + GAP
    })
    return at
  })
  const dur = motion ? 120 : 0
  return (
    <view
      ref={(n) => {
        n.select = (id) => setCur(Math.max(0, pills().findIndex((p) => p.id === id)))
        n.laid = () => pills().map((p) => laid()[p.id])
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={1920}
      height={H}
      onFocusChanged={setFocused}
      onLeft={() => {
        if (cur() > 0) setCur(cur() - 1)
        return true
      }}
      onRight={() => {
        if (cur() < pills().length - 1) setCur(cur() + 1)
        return true
      }}
      onEnter={() => {
        const p = pills()[cur()]
        if (p && props.onPill) props.onPill(p.id)
        return true
      }}
    >
      <For each={pills()}>
        {(p, i) => {
          const on = () => isCur(i())
          const ink = () => (p.danger ? '#fca5a5ff' : on() ? c().accent : c().base + 'd9')
          return (
            <view x={laid()[p.id].x} width={laid()[p.id].w} height={H} onPointerOver={() => props.onPointerPill && props.onPointerPill(p.id)}>
              <view width={laid()[p.id].w} height={H} borderRadius={36.73} color={p.danger ? (on() ? '#f871711f' : NONE) : c().base + '0f'} />
              <view
                width={laid()[p.id].w}
                height={H}
                borderRadius={36.73}
                color={NONE}
                border={{ width: BORDER, color: hex(p.danger ? '#f8717173' : c().base + '33') }}
                alpha={on() ? 0 : 1}
                transition={{ alpha: { duration: dur } }}
              />
              <view
                width={laid()[p.id].w}
                height={H}
                borderRadius={36.73}
                color={NONE}
                border={{ width: BORDER, color: hex(p.danger ? '#f87171' : c().accent) }}
                alpha={on() ? 1 : 0}
                transition={{ alpha: { duration: dur } }}
              />
              <view
                x={36.391}
                y={21.71}
                width={ICON}
                height={ICON}
                src={p.icon ? `icons/acc_${p.icon}.webp` : undefined}
                color={ink()}
                alpha={p.icon ? 1 : 0}
              />
              <text
                fontFamily={font()}
                fontSize={FONT}
                lineHeight={29.35}
                x={BORDER + PAD + (p.icon ? ICON + ICON_GAP : 0)}
                y={24.36}
                color={ink()}
              >
                {p.label}
              </text>
            </view>
          )
        }}
      </For>
    </view>
  )
}
