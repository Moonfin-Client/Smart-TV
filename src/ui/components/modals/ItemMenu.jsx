import { createComputed, createMemo, createSignal, on } from 'solid-js'
import { cssShift, fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { textWidth, wrapLines } from '../details/measure.js'
import { Icons, Texts } from './draw.jsx'
import { holdGuard } from './holdGuard.js'

// The card menu: a 522px panel with the title on up to two lines and a row per action. With
// `kind: 'confirm'` it's the menu's own Remove from Collection confirmation instead, Cancel first
// in focus.
//
// Props: `menu` ({title, actions: [{id, icon, label}]} or {kind: 'confirm', title, message,
// buttons: [{id, label, strong}]}), `tokens`. Enter calls onMenuPick(id), Back onMenuClose(). The
// node handed to ref has cur(), setCur(i) and rows(), so a holder that rebuilds the menu can keep
// the row. `held` says a held OK opened it and is still down.
const W = 522
// A row is its 1px border, 12px padding and a 33px line.
const ROW_H = 59
const DEFAULT_TOKENS = { focus: '#00a4dcff', surfaceA: () => '#1e1e28f7', os: () => '#ffffff1a', onBackground: '#ffffffff' }

const layoutItemMenu = (m) => {
  const out = { titles: [], rows: [], lines: [], buttons: [] }
  let y = 1 + 12 + 17
  wrapLines(m.title || '', 23, 'bold', W - 58)
    .slice(0, 2)
    .forEach((ln, i) => {
      out.titles.push({ k: `t${i}`, y: y + cssShift(23), text: ln, font: fontFor(ln, 'bold') })
      y += 33
    })
  y += 12
  if (m.kind === 'confirm') {
    wrapLines(m.message || '', 20, 'regular', W - 2 - 58).forEach((ln, i) => {
      out.lines.push({ k: `m${i}`, y: y + cssShift(20) + 2.5, text: ln, font: fontFor(ln) })
      y += 28
    })
    y += 23
    const made = (m.buttons || []).map((b) => ({
      ...b,
      w: 2 + 26 + textWidth(b.label, 20, b.strong ? 'bold' : 'regular') + 26 + 2,
      font: fontFor(b.label, b.strong ? 'bold' : 'regular'),
    }))
    let x = W - 1 - 21 - made.reduce((sum, b) => sum + b.w, 0) - 12 * Math.max(0, made.length - 1)
    made.forEach((b, i) => {
      out.buttons.push({ k: `b${i}-${b.id}`, id: b.id, i, x, y, w: b.w, label: b.label, font: b.font, labelY: y + 2 + 12 + cssShift(20) })
      x += b.w + 12
    })
    out.h = y + 61 + 23 + 1
  } else {
    ;(m.actions || []).forEach((a, i) => {
      out.rows.push({
        k: `r${i}-${a.id}`, id: a.id, i, y, icon: `icons/d/${a.icon}.webp`, label: a.label, font: fontFor(a.label),
        labelY: y + 13 + cssShift(23),
      })
      y += ROW_H
    })
    out.h = y + 12 + 1
  }
  out.x = Math.round((1920 - W) / 2)
  out.y = Math.round((1080 - out.h) / 2)
  return out
}

export default function ItemMenu(props) {
  const [cur, setCur] = createSignal(0)
  const t = () => props.tokens || DEFAULT_TOKENS
  const laid = createMemo(() => layoutItemMenu(props.menu || { title: '', actions: [] }))
  const confirm = () => laid().buttons.length > 0
  const count = () => laid().buttons.length || laid().rows.length
  const focusRow = () => (confirm() ? null : laid().rows[cur()] || null)
  const focusButton = () => (confirm() ? laid().buttons[cur()] || null : null)
  createComputed(on(() => props.menu, () => setCur(0)))
  const guard = holdGuard(props.held)

  const titles = createMemo(() =>
    laid().titles.map((tl) => ({ k: tl.k, x: 30, y: tl.y, t: tl.text, font: tl.font, size: 23, lh: 33, color: t().onBackground })),
  )
  const icons = createMemo(() => laid().rows.map((r) => ({ k: r.k, x: 31, y: r.y + 13.5, w: 32, h: 32, src: r.icon, color: t().onBackground })))
  const labels = createMemo(() =>
    laid().rows.map((r) => ({ k: r.k, x: 86, y: r.labelY, t: r.label, font: r.font, size: 23, lh: 33, color: t().onBackground })),
  )
  const lines = createMemo(() => laid().lines.map((ln) => ({ k: ln.k, x: 30, y: ln.y, t: ln.text, font: ln.font, size: 20, lh: 28, color: '#ffffffb3' })))
  const buttonTexts = createMemo(() =>
    laid().buttons.map((b) => ({ k: b.k, x: b.x + 28, y: b.labelY, t: b.label, font: b.font, size: 20, lh: 33, color: '#ffffffff' })),
  )

  return (
    <view
      ref={(n) => {
        n.cur = cur
        n.setCur = (i) => {
          if (i >= 0 && i < count()) setCur(i)
        }
        n.rows = () => laid().rows
        if (props.ref) props.ref(n)
      }}
      width={1920}
      pointerModal
      height={1080}
      onUp={() => {
        if (cur() > 0 && !confirm()) setCur(cur() - 1)
        return true
      }}
      onDown={() => {
        if (cur() < count() - 1 && !confirm()) setCur(cur() + 1)
        return true
      }}
      onLeft={() => {
        if (cur() > 0 && confirm()) setCur(cur() - 1)
        return true
      }}
      onRight={() => {
        if (cur() < count() - 1 && confirm()) setCur(cur() + 1)
        return true
      }}
      onEnter={() => {
        if (guard.down()) return true
        const r = laid().buttons[cur()] || laid().rows[cur()]
        if (r && props.onMenuPick) props.onMenuPick(r.id)
        return true
      }}
      onEnterRelease={() => guard.up()}
      onBack={() => {
        if (props.onMenuClose) props.onMenuClose()
        return true
      }}
      onKeyPress={() => true}
    >
      <view width={1920} height={1080} color="#0000008c" />
      <view
        x={laid().x}
        y={laid().y}
        width={W}
        height={laid().h}
        // The Magic Remote's cursor focuses the row or button under it, and OK then picks it
        // (app/pointer.js).
        pointerItems={() => (confirm() ? laid().buttons.map((b) => ({ x: b.x, y: b.y, w: b.w, h: 61 })) : laid().rows.map((r) => ({ x: 8, y: r.y, w: 506, h: ROW_H })))}
        onPointerItem={(it, i) => cur() !== i && setCur(i)}
      >
        <view width={W} height={laid().h} borderRadius={12} color="#00000000" shadow={{ color: shadowColor('#00000066'), x: 0, y: 12, blur: 35, spread: 0 }} />
        <view width={W} height={laid().h} borderRadius={12} color={t().surfaceA(0.97)} border={{ width: 1, color: hex(t().os(0.12)) }} />
        <view
          alpha={focusRow() ? 1 : 0}
          x={8}
          y={focusRow() ? focusRow().y : 0}
          width={506}
          height={ROW_H}
          borderRadius={9}
          color={t().os(0.1)}
          border={{ width: 1, color: hex(t().focus) }}
        />
        <Texts list={titles()} />
        <Icons list={icons()} />
        <Texts list={labels()} />
        <Texts list={lines()} />
        <view
          alpha={focusButton() ? 1 : 0}
          x={focusButton() ? focusButton().x : 0}
          y={focusButton() ? focusButton().y : 0}
          width={focusButton() ? focusButton().w : 0}
          height={61}
          borderRadius={9}
          color="#ffffff1a"
          border={{ width: 2, color: hex('#ffffffff') }}
        />
        <Texts list={buttonTexts()} />
      </view>
    </view>
  )
}
