import { For, createMemo, createSelector, createSignal, onCleanup, onMount } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { focusScroll } from '../nav/focusScroll.js'
import { lineY, withAlpha } from './bookGrid.js'

// `options` is [{ id, label, on }] and `kind` is 'radio' or 'check'. It keeps every arrow key.
// shortcut: the panel's 16px backdrop blur isn't drawn, only its 92 percent tint. Add it with the
// shared Frost once the library's sheets get theirs.
const W = 380
const OPTION_H = 63
const STEP = 67
const TOP = 105
const CLEAR = '#00000000'

export default function SidePanel(props) {
  const [cur, setCur] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const [scrollY, setScrollY] = createSignal(0)
  const [inX, setInX] = createSignal(W)
  const titleFont = uiFont('bold')
  const options = () => props.options || []
  const rows = createMemo(() =>
    options().map((o, i) => ({ k: String(o.id == null ? 'none' : o.id), i, y: TOP + i * STEP, label: o.label, font: fontFor(o.label, 'medium'), on: !!o.on })),
  )
  const list = keyed(rows, (r) => r.k)
  const isCur = createSelector(cur)
  const contentH = () => TOP + options().length * STEP - 4 + 40
  const check = () => props.kind === 'check'
  const titleY = lineY(40, 33, 32)
  const labelY = lineY(15, 33, 18)
  onMount(() => {
    const t = setTimeout(() => setInX(0), 0)
    onCleanup(() => clearTimeout(t))
  })
  // The Magic Remote's cursor (app/pointer.js): an option in full view takes focus on hover, one the
  // panel would scroll to on a click.
  const pointAt = (i, click) => {
    const top = TOP + i * STEP - scrollY()
    if (!click && (top < 0 || top + OPTION_H > 1080 || cur() === i)) return false
    setCur(i)
    reveal()
    return click
  }
  const reveal = () => setScrollY(focusScroll(TOP + cur() * STEP, OPTION_H, scrollY(), 1080, Math.max(0, contentH() - 1080)))
  const move = (step) => {
    const next = cur() + step
    if (next >= 0 && next < options().length) {
      setCur(next)
      reveal()
    }
    return true
  }
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      x={props.x || 0}
      width={1920}
      height={1080}
      onFocusChanged={(on) => {
        setHas(on)
        if (!on) return
        setCur(Math.max(0, Math.min(props.start || 0, options().length - 1)))
        reveal()
      }}
      onUp={() => move(-1)}
      onDown={() => move(1)}
      onLeft={() => true}
      onRight={() => true}
      onEnter={() => {
        const option = options()[cur()]
        if (option) props.onPanelPick(option, cur())
        return true
      }}
      onBack={() => {
        props.onPanelClose()
        return true
      }}
    >
      <view width={1920} height={1080} color={withAlpha(props.look.scrim, 0.45)} />
      <view
        transition={{ x: { duration: 250, easing: 'ease-out' } }}
        x={1540 + inX()}
        width={W}
        height={1080}
        color={withAlpha(props.look.surface, 0.92)}
        clipping
      >
        <view width={1} height={1080} color={props.look.os08} />
        <view y={-scrollY()} width={W} height={Math.max(1080, contentH())}>
          <text fontFamily={titleFont} fontSize={32} x={32} y={titleY} color={props.look.onSurface}>
            {props.title}
          </text>
          <For each={list.keys()}>
            {(k) => {
              const row = list.item(k)
              const lit = () => has() && isCur(row().i)
              return (
                <view x={32} y={row().y} width={316} height={OPTION_H} onPointerOver={() => pointAt(row().i, false)} onPointerClick={() => pointAt(row().i, true)}>
                  <view width={316} height={OPTION_H} borderRadius={8} color="#ffffff1a" border={{ width: 1, color: hex(lit() ? props.look.focus : CLEAR) }} />
                  <view
                    x={17}
                    y={20.5}
                    width={22}
                    height={22}
                    borderRadius={check() ? 4 : 11}
                    color={check() && row().on ? props.look.accent : CLEAR}
                    border={{ width: 2, color: hex(row().on ? props.look.accent : props.look.os35) }}
                  />
                  <view x={22} y={25.5} width={12} height={12} borderRadius={6} color={props.look.accent} alpha={!check() && row().on ? 1 : 0} />
                  <view
                    x={20}
                    y={23.5}
                    width={16}
                    height={16}
                    src="icons/book_check_rounded.webp"
                    color={props.look.onAccent}
                    alpha={check() && row().on ? 1 : 0}
                  />
                  <text
                    fontFamily={row().font}
                    fontSize={18}
                    x={53}
                    y={labelY}
                    maxWidth={246}
                    maxLines={1}
                    color={row().on || lit() ? props.look.onSurface : props.look.os80}
                  >
                    {row().label}
                  </text>
                </view>
              )
            }}
          </For>
        </view>
      </view>
    </view>
  )
}
