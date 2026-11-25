import { For, createMemo, createSelector, createSignal } from 'solid-js'
import { hex } from '../../color.js'
import { fontFor, uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { focusScroll } from '../nav/focusScroll.js'
import { lineY } from './bookGrid.js'
import { RAIL_ROW_H, RAIL_WIDTH, railLayout } from './bookParts.js'

// The rail owns Up, Down and Enter and holds focus at its ends and on Left. It hands Right to
// host.onRailRight(), and Enter calls host.onRailOpen(entry).
const CLEAR = '#00000000'

export default function BookRail(props) {
  const [cur, setCur] = createSignal(0)
  const [scrollY, setScrollY] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const lay = createMemo(() => railLayout(props.name || '', props.entries || []))
  const rows = keyed(() => lay().rows, (r) => r.k)
  const headers = keyed(() => lay().headers, (h) => h.k)
  const isCur = createSelector(cur)
  const headerFont = uiFont('bold')
  const subFont = uiFont()
  const titleY = lineY(40, 48, 40)
  const subY = () => lineY(40 + 48 * lay().titleLines + 7, 33, 22)
  const labelY = lineY((RAIL_ROW_H - 33) / 2, 33, 23)
  const countY = lineY((RAIL_ROW_H - 33) / 2, 33, 22)
  const reveal = () => {
    const row = lay().rows[cur()]
    if (row) setScrollY(focusScroll(row.y, RAIL_ROW_H, scrollY(), 1080, Math.max(0, lay().height - 1080)))
  }
  // The Magic Remote's cursor (app/pointer.js): an entry in full view takes focus on hover, one the
  // rail would scroll to on a click.
  const point = (key, click) => {
    const i = (props.entries || []).findIndex((e) => e.key === key)
    const row = lay().rows[i]
    if (!row) return false
    if (!click && (row.y < scrollY() || row.y + RAIL_ROW_H > scrollY() + 1080 || (has() && cur() === i))) return false
    if (!has()) props.host.pointNav()
    setCur(i)
    reveal()
    return click
  }
  const move = (step) => {
    const next = cur() + step
    if (next >= 0 && next < (props.entries || []).length) {
      setCur(next)
      reveal()
    }
    return true
  }
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      width={RAIL_WIDTH}
      height={1080}
      clipping
      onFocusChanged={(on) => {
        setHas(on)
        if (!on) return
        // Coming in from the screen lands on the open entry.
        const i = (props.entries || []).findIndex((e) => e.key === props.current)
        if (i >= 0) setCur(i)
        reveal()
      }}
      onUp={() => move(-1)}
      onDown={() => move(1)}
      onLeft={() => true}
      onRight={() => {
        props.host.onRailRight()
        return true
      }}
      onEnter={() => {
        const entry = (props.entries || [])[cur()]
        if (entry) props.host.onRailOpen(entry)
        return true
      }}
    >
      <view x={413} width={1} height={1080} color={props.look.os06} />
      <view y={-scrollY()} width={RAIL_WIDTH} height={Math.max(1080, lay().height)}>
        <text
          fontFamily={fontFor(props.name || '', 'bold')}
          fontSize={40}
          x={60}
          y={titleY}
          maxWidth={326}
          maxLines={2}
          lineHeight={48}
          color={props.look.onSurface}
        >
          {props.name}
        </text>
        <text fontFamily={subFont} fontSize={22} x={60} y={subY()} color={props.look.os60}>
          {props.subtitle}
        </text>
        <view>
          <For each={headers.keys()}>
            {(k) => {
              const hd = headers.item(k)
              return (
                <text fontFamily={headerFont} fontSize={18} letterSpacing={2} x={60} y={hd().y + 6} color={props.look.os50}>
                  {hd().label}
                </text>
              )
            }}
          </For>
        </view>
        <view>
          <For each={rows.keys()}>
            {(k) => {
              const row = rows.item(k)
              const on = () => row().k === props.current
              return (
                <view x={40} y={row().y} width={346} height={64}>
                  <view width={346} height={64} borderRadius={20} color={on() ? props.look.accent16 : CLEAR} />
                  <view
                    x={-3}
                    y={-3}
                    width={352}
                    height={70}
                    borderRadius={23}
                    color={CLEAR}
                    border={{ width: 3, color: hex(props.look.focus) }}
                    alpha={has() && isCur(row().i) ? 1 : 0}
                  />
                  <view x={20} y={17} width={30} height={30} src={'icons/' + row().icon + '.webp'} color={on() ? props.look.accent : props.look.os80} />
                  <text fontFamily={on() ? row().boldFont : row().labelFont} fontSize={23} x={70} y={labelY} color={props.look.onSurface}>
                    {on() ? row().boldLabel : row().label}
                  </text>
                  <text fontFamily={subFont} fontSize={22} x={326} y={countY} mountX={1} color={on() ? props.look.accent : props.look.os62}>
                    {row().count}
                  </text>
                  <view width={346} height={64} onPointerOver={() => point(row().k)} onPointerClick={() => point(row().k, true)} />
                </view>
              )
            }}
          </For>
        </view>
      </view>
    </view>
  )
}
