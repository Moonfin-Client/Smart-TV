import $L from '../../../services/i18n.js'
import { createMemo, createSignal } from 'solid-js'
import { cssShift, uiFont, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { focusScroll } from '../nav/focusScroll.js'
import { Icons, Rects, Texts } from './draw.jsx'

// More Actions: the action row's buttons that a cap folded away, stretched into 560px rows with
// their icon and label, in a panel over a 60% scrim. Props: `buttons` ([{id, icon, label,
// active}]), `tokens`, and `frame` ({x, y, k, w, h}) for a style whose stage is scaled (Frost),
// where the fixed layer lands inside the stage: centered in it, scaled with it, and its scrim
// covering only the stage. `frame.center` centers the title, which Premiere's centered hero asks
// for. Enter calls onMorePick(id), Back onMoreClose().
const W = 610
const ROW = { x: 25, w: 560, h: 68, gap: 10, top: 1 + 24 + 57 }
// The panel stops at 84% of the screen and hides the rest, which focus still scrolls to.
const MAX_H = 0.84 * 1080
// Its fixed layer sits in the details page's scroller, which starts 9px down.
const TOP = 9

export default function OverflowMenu(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const t = () => props.tokens
  const buttons = () => props.buttons || []
  const f = () => props.frame || { x: 0, y: 0, k: 1, w: 1920, h: 1080, top: TOP }
  const laid = createMemo(() => {
    const n = buttons().length
    const fullH = ROW.top + n * ROW.h + Math.max(0, n - 1) * ROW.gap + 24 + 1
    const fr = f()
    const top = fr.top || 0
    const h = Math.min(fr.top == null ? 0.84 * fr.h : MAX_H, fullH)
    return { fullH, h, top, x: Math.round((fr.w - W) / 2), y: top + Math.round((fr.h - top - h) / 2) }
  })
  const rowY = (i) => ROW.top + i * (ROW.h + ROW.gap)
  const rows = createMemo(() =>
    buttons().map((b, i) => {
      const on = i === cur()
      return { k: `r-${b.id}`, x: ROW.x, y: rowY(i), w: ROW.w, h: ROW.h, r: 12, color: on ? '#ffffff1a' : '#ffffff0f', bw: 1, bc: on ? t().focus : '#ffffff59' }
    }),
  )
  const icons = createMemo(() =>
    buttons().map((b, i) => ({ k: `i-${b.id}`, x: ROW.x + 11.5, y: rowY(i) + 16.5, w: 35, h: 35, src: `icons/d/${b.icon}.webp`, color: b.active ? '#ff4757ff' : '#ffffffff' })),
  )
  const labels = createMemo(() =>
    buttons().map((b, i) => ({ k: `l-${b.id}`, x: ROW.x + 61, y: rowY(i) + 23.5 + cssShift(19), t: b.label, font: fontFor(b.label, 'bold'), size: 19, lh: 20.9, color: '#ffffffff' })),
  )
  const move = (d) => {
    const next = Math.max(0, Math.min(buttons().length - 1, cur() + d))
    setCur(next)
    // The scrollport sits inside the panel's 1px border.
    setScroll(focusScroll(rowY(next) - 1, ROW.h, scroll(), laid().h - 2, laid().fullH - laid().h))
    return true
  }
  return (
    <view
      ref={props.ref}
      width={1920}
      pointerModal
      height={1080}
      onUp={() => move(-1)}
      onDown={() => move(1)}
      onEnter={() => {
        const b = buttons()[cur()]
        if (b && props.onMorePick) props.onMorePick(b.id)
        return true
      }}
      onBack={() => {
        if (props.onMoreClose) props.onMoreClose()
        return true
      }}
      onKeyPress={() => true}
    >
      <view x={f().x} y={f().y} width={f().w} height={f().h} scale={f().k} pivot={0}>
      <view y={laid().top} width={f().w} height={f().h - laid().top} color="#00000099" />
      <view x={laid().x} y={laid().y} width={W} height={laid().h}>
        <view width={W} height={laid().h} borderRadius={20} color={t().surfaceA(0.97)} border={{ width: 1, color: hex(t().os(0.12)) }} />
        <view x={1} y={1} width={W - 2} height={laid().h - 2} clipping>
          <view
            x={-1}
            y={-1 - scroll()}
            width={W}
            height={laid().fullH}
            // The Magic Remote's cursor focuses the row under it, and OK then picks it (app/pointer.js).
            pointerItems={() => buttons().map((b, i) => ({ x: ROW.x, y: rowY(i), w: ROW.w, h: ROW.h }))}
            onPointerItem={(it, i) => cur() !== i && setCur(i)}
          >
            <text
              fontFamily={uiFont('bold')}
              fontSize={28}
              x={33}
              y={29 + cssShift(28)}
              lineHeight={33}
              color="#ffffffff"
              contain="width"
              maxWidth={W - 66}
              textAlign={f().center ? 'center' : 'left'}
            >
              {$L('More Actions')}
            </text>
            <Rects list={rows()} />
            <Icons list={icons()} />
            <Texts list={labels()} />
          </view>
        </view>
      </view>
      </view>
    </view>
  )
}
