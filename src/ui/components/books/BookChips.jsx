import { For, createMemo, createSelector, createSignal } from 'solid-js'
import { shadowColor } from '../../theme.js'
import { uiFont } from '../../text.js'
import { keyed } from '../library/pageKit.js'
import { focusScroll } from '../nav/focusScroll.js'
import { CHIPS_H, navIcon } from './bookParts.js'
import { textWidth } from './bookText.js'

// The chip row over every book screen. It owns Left, Right and OK, hands Down to
// host.onStripDown() and calls host.onStripOpen(entry).
const CLEAR = '#00000000'

export default function BookChips(props) {
  const [cur, setCur] = createSignal(0)
  const [has, setHas] = createSignal(false)
  const font = uiFont('bold')
  const chips = createMemo(() => {
    let x = 60
    return (props.entries || []).map((entry, i) => {
      const w = Math.ceil(textWidth(entry.label, 15, 'bold')) + 74
      const out = { k: entry.key, i, x, w, label: entry.label, icon: navIcon(entry), current: entry.key === props.current }
      x += w + 10
      return out
    })
  })
  const list = keyed(chips, (c) => c.k)
  const isCur = createSelector(cur)
  const contentW = () => {
    const last = chips()[chips().length - 1]
    return last ? last.x + last.w + 60 : 0
  }
  const maxScroll = () => Math.max(0, contentW() - 1920)
  const opened = chips().find((c) => c.current)
  const [sx, setSx] = createSignal(opened ? Math.max(0, Math.min(maxScroll(), Math.round(opened.x - (1920 - opened.w) / 2))) : 0)
  const reveal = () => {
    const c = chips()[cur()]
    if (c) setSx(focusScroll(c.x, c.w, sx(), 1920, maxScroll()))
  }
  const glow = () => ({ color: shadowColor(props.look.accent45), x: 0, y: 0, blur: 14, spread: 1 })
  // The Magic Remote's cursor (app/pointer.js): a chip in full view takes focus on hover, one the row
  // would scroll to on a click.
  const point = (i, click) => {
    const c = chips()[i]
    if (!c) return false
    if (!click && (c.x < sx() || c.x + c.w > sx() + 1920 || (has() && cur() === i))) return false
    if (!has()) props.host.pointNav()
    setCur(i)
    reveal()
    return click
  }
  const move = (step) => {
    const next = cur() + step
    if (next >= 0 && next < chips().length) {
      setCur(next)
      reveal()
    }
    return true
  }
  return (
    <view
      ref={(n) => props.ref && props.ref(n)}
      width={1920}
      height={CHIPS_H}
      clipping
      onFocusChanged={(on) => {
        setHas(on)
        if (!on) return
        setCur(Math.max(0, (props.entries || []).findIndex((e) => e.key === props.current)))
        reveal()
      }}
      onLeft={() => move(-1)}
      onRight={() => move(1)}
      onUp={() => true}
      onDown={() => {
        props.host.onStripDown()
        return true
      }}
      onEnter={() => {
        const entry = (props.entries || [])[cur()]
        if (entry) props.host.onStripOpen(entry)
        return true
      }}
    >
      <view x={-sx()} y={18} width={Math.max(1920, contentW())} height={57}>
        <For each={list.keys()}>
          {(k) => {
            const ch = list.item(k)
            const lit = () => has() && isCur(ch().i)
            const ink = () => (lit() ? props.look.onAccent : ch().current ? props.look.accent : props.look.os80)
            return (
              <view x={ch().x} width={ch().w} height={57} onPointerOver={() => point(ch().i)} onPointerClick={() => point(ch().i, true)}>
                <view width={ch().w} height={57} borderRadius={22} color={CLEAR} shadow={glow()} alpha={lit() ? 1 : 0} />
                <view width={ch().w} height={57} borderRadius={22} color={lit() ? props.look.accent : ch().current ? props.look.accent16 : props.look.os09} />
                <view x={20} y={16.5} width={24} height={24} src={'icons/' + ch().icon + '.webp'} color={ink()} />
                <text fontFamily={font} fontSize={15} x={54} y={21} color={ink()}>
                  {ch().label}
                </text>
              </view>
            )
          }}
        </For>
      </view>
    </view>
  )
}
