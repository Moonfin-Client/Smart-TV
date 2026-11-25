import { createComputed, createMemo, createSignal, on, untrack } from 'solid-js'
import { cssShift, fontFor, normalShift } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor, theme } from '../../theme.js'
import { textWidth, wrapLines } from '../details/measure.js'
import { Icons, Rects, Texts, appear } from './draw.jsx'
import { focusScroll } from '../nav/focusScroll.js'

// The frosted center dialogs: a 60% scrim, a rounded glass panel with a centered title, then one of
// - 'confirm': a message and Cancel and Delete buttons,
// - 'list': the Add to Playlist or Collection rows, each with an icon tile,
// - 'rating': the thumbs, stars or score stepper and Cancel.
//
// Props: `dialog` (the spec), `tokens`. Enter calls onDialogPick(id), Back onDialogClose(), and
// Left and Right on the stars call onDialogAdjust(delta).
// The renderer can't blur what's behind the panel, so it's 97% opaque rather than 85% over a blur.
// The panel, text and focus take the theme's surface, text and accent colors.
// 70vh of content, plus the padding and border.
const LIST_MAX_H = 756 + 64 + 2

const button = (id, label, x, y, focusFill) => {
  const w = Math.max(140, 2 + 80 + textWidth(label, 20, 'bold'))
  return { k: `b-${id}`, id, x, y, w, h: 54, label, focusFill: focusFill || theme().accent }
}

export const layoutPanelDialog = (d, t = theme()) => {
  const FOCUS = t.accent
  const out = { boxes: [], texts: [], icons: [], focusables: [], w: 0, h: 0 }
  const text = (k, x, y, t, size, weight, color, extra) => out.texts.push({ k, x, y, t, size, font: fontFor(t, weight), color, lh: 33, maxw: 0, ...extra })
  if (d.kind === 'list') {
    // A form grows with its message up to 560 wide. The list grows with its widest row or message,
    // between 460 and 560.
    const formMsg = d.form && d.message ? d.message : ''
    const rowW = (d.rows || []).map((r) => 86 + Math.max(textWidth(r.label, 20), r.detail ? textWidth(r.detail, 15) : 0))
    const natural = Math.max(textWidth(d.title, 28, 'bold'), d.message ? textWidth(d.message, 18) : 0, ...rowW)
    const contentW = Math.min(560, Math.max(460, Math.ceil(formMsg ? textWidth(formMsg, 18) : natural)))
    out.w = contentW + 74
    let y = 33
    text('title', 37 + (contentW - textWidth(d.title, 28, 'bold')) / 2, y + cssShift(28), d.title, 28, 'bold', t.onSurface)
    y += 33 + 20
    if (formMsg) {
      // The confirm step's form pads the message 24px lower than a plain one.
      if (d.form === 'confirm') y += 8 + 16
      wrapLines(formMsg, 18, 'regular', contentW).forEach((ln, i) => {
        text(`fm${i}`, 37 + (contentW - textWidth(ln, 18)) / 2, y + cssShift(18), ln, 18, 'regular', t.os(0.5))
        y += 33
      })
      y += 20
    }
    // The message: Loading on its own under the title, or No playlists found under Create New. Its
    // 16px margins fold into the title's 20.
    const message = (gap) => {
      y += gap
      text('msg', 37 + (contentW - textWidth(d.message, 18)) / 2, y + cssShift(18), d.message, 18, 'regular', t.os(0.5))
      y += 33 + 16
    }
    if (d.form === 'create') {
      // The name field, then Create and Cancel. Create stays gray and dim until there's a name.
      y += 8
      out.focusables.push({ id: 'input', x: 37, y, w: contentW, h: 63, r: 16 })
      out.boxes.push({ k: 'input', id: 'input', x: 37, y, w: contentW, h: 63, r: 16, color: t.os(0.06), bw: 1, bc: t.os(0.15), onColor: t.os(0.1), onBc: FOCUS })
      const shown = d.value || d.placeholder || ''
      text('inputText', 37 + 17, y + 15 + cssShift(20), shown, 20, 'regular', d.value ? t.onSurface : t.os(0.3), { maxw: contentW - 34, lines: 1 })
      y += 63 + 20
    }
    if (d.form) {
      const made = (d.buttons || []).map((b) => ({ ...b, w: Math.max(120, 66 + textWidth(b.label, 18, 'bold')) }))
      let x = 37 + (contentW - made.reduce((sum, b) => sum + b.w, 0) - 12 * Math.max(0, made.length - 1)) / 2
      made.forEach((b) => {
        out.focusables.push({ id: b.id, x, y, w: b.w, h: 47, r: 14, fill: true, focusFill: FOCUS, disabled: !!b.disabled })
        out.boxes.push({ k: `fb-${b.id}`, id: b.id, x, y, w: b.w, h: 47, r: 14, color: b.primary && !b.disabled ? FOCUS : t.os(0.1), a: b.disabled ? 0.7 : 1 })
        text(`fb-${b.id}t`, x + (b.w - textWidth(b.label, 18, 'bold')) / 2, y + 13 + cssShift(18), b.label, 18, 'bold', b.primary && !b.disabled ? t.onAccent : t.onSurface, { lh: 21, a: b.disabled ? 0.7 : 1 })
        x += b.w + 12
      })
      y += 47 + (d.form === 'confirm' || d.form === 'create' ? 8 : 0)
    } else if (d.message && !(d.rows || []).length) message(0)
    let after = 0
    ;(d.rows || []).forEach((r, i) => {
      if (i && !after) y += 4
      const h = r.detail ? 96 : 68
      out.focusables.push({ id: r.id, x: 37, y, w: contentW, h, r: 12, ring: true })
      out.boxes.push({ k: `t${i}`, x: 37 + 16, y: y + (h - 40) / 2, w: 40, h: 40, r: 8, color: t.os(0.1) })
      out.icons.push({ k: `i${i}`, x: 37 + 24, y: y + (h - 24) / 2, src: `icons/d/${r.icon}.webp`, color: t.os(0.7) })
      const ty = r.detail ? y + 14 : y + 17.5
      text(`l${i}`, 37 + 70, ty + cssShift(20), r.label, 20, 'regular', t.onSurface, { maxw: contentW - 86, lines: 1 })
      if (r.detail) text(`d${i}`, 37 + 70, ty + 33 + 2 + cssShift(15), r.detail, 15, 'regular', t.os(0.4))
      y += h
      after = 0
      if (i === 0 && d.message && !d.form) {
        message(16)
        after = 16
      }
    })
    // The dialog stops at 70% of the screen and scrolls its content.
    out.fullH = y + 33
    out.h = Math.min(LIST_MAX_H, out.fullH)
  } else {
    // The confirm and rating dialogs are as wide as their copy, between 420 and 520.
    const natural = Math.max(textWidth(d.title, 30, 'bold'), d.message ? textWidth(d.message, 20) : 0)
    const contentW = Math.min(520, Math.max(420, natural))
    out.w = contentW + 98
    const cx = 49
    let y = 41
    text('title', cx + (contentW - textWidth(d.title, 30, 'bold')) / 2, y + cssShift(30), d.title, 30, 'bold', t.onSurface)
    y += 33 + 12
    if (d.message) {
      const lines = wrapLines(d.message, 20, 'regular', contentW)
      lines.forEach((ln, i) => {
        text(`m${i}`, cx + (contentW - textWidth(ln, 20)) / 2, y + i * 28 + normalShift(20), ln, 20, 'regular', t.os(0.6), { lh: 1 })
      })
      y += lines.length * 28 + 36
    }
    if (d.kind === 'rating') {
      if (d.style === 'thumbs') {
        const x0 = cx + (contentW - 260) / 2
        ;[['like', 'rating_thumbUp', d.likes === true], ['dislike', 'rating_thumbDown', d.likes === false]].forEach(([id, icon, on], i) => {
          const x = x0 + i * 140
          out.focusables.push({ id, x, y, w: 120, h: 96, r: 16, fill: true, focusFill: t.accentA(0.35) })
          out.boxes.push({ k: `th${i}`, x, y, w: 120, h: 96, r: 16, color: on ? t.accentA(0.35) : t.os(0.1) })
          out.icons.push({ k: `ti${i}`, x: x + 38, y: y + 26, w: 44, src: `icons/d/${icon}.webp` })
        })
        y += 96 + 24
      } else if (d.style === 'stars') {
        const x0 = cx + (contentW - 5 * 56) / 2
        out.focusables.push({ id: 'stars', x: x0 - 12, y: y - 8, w: 5 * 56 + 24, h: 72, r: 16, fill: true, adjust: true, focusFill: t.accentA(0.35) })
        for (let i = 0; i < 5; i++) {
          const left = d.stars - i
          const icon = left >= 0.75 ? 'rating_starFull' : left >= 0.25 ? 'rating_starHalf' : 'rating_star'
          out.icons.push({ k: `s${i}`, x: x0 + i * 56, y, w: 56, src: `icons/d/${icon}.webp`, color: '#ffc107ff' })
        }
        y += 56 + 12
        const hint = d.hint || ''
        text('hint', cx + (contentW - textWidth(hint, 20)) / 2, y + cssShift(20), hint, 20, 'regular', t.os(0.7))
        y += 33 + 24
      } else {
        const x0 = cx + (contentW - 300) / 2
        out.focusables.push({ id: 'down', x: x0, y, w: 72, h: 72, r: 16, fill: true, focusFill: t.accentA(0.35) })
        out.icons.push({ k: 'minus', x: x0 + 18, y: y + 18, w: 36, src: 'icons/d/rating_remove.webp' })
        const score = d.scoreLabel || ''
        text('score', x0 + 150 - textWidth(score, 30, 'bold') / 2, y + 19.5 + cssShift(30), score, 30, 'bold', t.onSurface)
        out.focusables.push({ id: 'up', x: x0 + 228, y, w: 72, h: 72, r: 16, fill: true, focusFill: t.accentA(0.35) })
        out.icons.push({ k: 'plus', x: x0 + 246, y: y + 18, w: 36, src: 'icons/d/rating_add.webp' })
        y += 72 + 24
      }
    }
    const btns = d.buttons || []
    if (btns.length) {
      const made = btns.map((b) => button(b.id, b.label, 0, y, b.danger ? '#c62828ff' : FOCUS))
      const total = made.reduce((s, b) => s + b.w, 0) + 16 * (made.length - 1)
      let x = cx + (contentW - total) / 2
      made.forEach((b) => {
        b.x = x
        x += b.w + 16
        // Delete's focus takes the recording red on its edge too, the others a white edge.
        out.focusables.push({ id: b.id, x: b.x, y: b.y, w: b.w, h: 54, r: 16, fill: true, focusFill: b.focusFill, focusEdge: b.focusFill === FOCUS ? t.onSurface : b.focusFill })
        out.boxes.push({ k: b.k, x: b.x, y: b.y, w: b.w, h: 54, r: 16, color: t.os(0.1) })
        text(`${b.k}t`, b.x + (b.w - textWidth(b.label, 20, 'bold')) / 2, b.y + 15.5 + normalShift(20), b.label, 20, 'bold', t.onSurface, { lh: 1 })
      })
      y += 54
    }
    out.h = y + 41
    out.fullH = out.h
  }
  out.x = Math.round((1920 - out.w) / 2)
  out.y = Math.round((1080 - out.h) / 2)
  return out
}

// Up and Down go to the nearest stop above or below, Left and Right along the same line.
const moveIn = (all, f, dx, dy) => {
  const cand = all
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => (dy ? Math.sign(g.y - f.y) === dy && g.y !== f.y : Math.sign(g.x - f.x) === dx && Math.abs(g.y - f.y) < 4))
  if (!cand.length) return -1
  cand.sort((a, b) => Math.abs(a.g.y - f.y) + Math.abs(a.g.x - f.x) - (Math.abs(b.g.y - f.y) + Math.abs(b.g.x - f.x)))
  return cand[0].i
}

export default function PanelDialog(props) {
  const [cur, setCur] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const laid = createMemo(() => layoutPanelDialog(props.dialog || { kind: 'confirm', title: '' }))
  const focus = () => laid().focusables[cur()] || null
  // The name field shows focus in its own box.
  const boxes = createMemo(() => {
    const f = focus()
    return laid().boxes.map((b) => (f && b.id === f.id && (b.onColor || b.onBc) ? { ...b, color: b.onColor || b.color, bc: b.onBc || b.bc } : b))
  })
  // The focused row scrolls into view inside the panel's 1px border.
  const reveal = () => {
    const f = untrack(focus)
    const l = untrack(laid)
    setScroll(f ? focusScroll(f.y - 1, f.h, untrack(scroll), l.h - 2, l.fullH - l.h) : 0)
  }
  createComputed(
    on(
      () => props.dialog,
      (d) => {
        if (!d) return
        const i = untrack(laid).focusables.findIndex((f) => f.id === d.initial)
        setCur(i >= 0 ? i : 0)
        setScroll(0)
        reveal()
      },
    ),
  )
  const move = (dx, dy) => {
    const f = focus()
    if (!f) return
    // A disabled button can't take focus, so a press toward it goes nowhere.
    const i = moveIn(laid().focusables, f, dx, dy)
    if (i >= 0 && !laid().focusables[i].disabled) setCur(i)
    reveal()
  }
  // The dialog fades in and grows from 95% (a list) or 92% over 200ms.
  const shown = appear()
  const FADE = { duration: 200, easing: 'ease' }
  // A `toggle` dialog (Delete) swaps between its two buttons on Left and Right.
  const toggle = () => {
    if (!props.dialog || !props.dialog.toggle) return false
    const all = laid().focusables
    setCur(cur() === all.length - 1 ? all.length - 2 : all.length - 1)
    return true
  }
  const adjust = (d) => {
    const f = focus()
    if (f && f.adjust && props.onDialogAdjust) {
      props.onDialogAdjust(d)
      return true
    }
    return false
  }
  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      onUp={() => {
        move(0, -1)
        return true
      }}
      onDown={() => {
        move(0, 1)
        return true
      }}
      onLeft={() => {
        if (!adjust(-1) && !toggle()) move(-1, 0)
        return true
      }}
      onRight={() => {
        if (!adjust(1) && !toggle()) move(1, 0)
        return true
      }}
      onEnter={() => {
        const f = focus()
        if (f && props.onDialogPick) props.onDialogPick(f.id)
        return true
      }}
      onBack={() => {
        if (props.onDialogClose) props.onDialogClose()
        return true
      }}
      onKeyPress={() => true}
      alpha={shown() ? 1 : 0}
      transition={{ alpha: FADE }}
    >
      <view width={1920} height={1080} color="#00000099" />
      <view
        x={laid().x}
        y={laid().y}
        width={laid().w}
        height={laid().h}
        scale={shown() ? 1 : props.dialog && props.dialog.kind === 'list' ? 0.95 : 0.92}
        transition={{ scale: FADE }}
      >
        <view
          width={laid().w}
          height={laid().h}
          borderRadius={24}
          color="#00000000"
          shadow={{ color: shadowColor('#00000066'), x: 0, y: 8, blur: 32, spread: 0 }}
        />
        <view width={laid().w} height={laid().h} borderRadius={24} color={`${theme().surface.slice(0, 7)}f7`} border={{ width: 1, color: hex(theme().os(0.12)) }} />
        <view x={1} y={1} width={laid().w - 2} height={laid().h - 2} clipping>
        <view x={-1} y={-1 - scroll()} width={laid().w} height={laid().fullH}>
        <Rects list={boxes()} />
        <view
          alpha={focus() && focus().fill ? 1 : 0}
          x={focus() ? focus().x : 0}
          y={focus() ? focus().y : 0}
          width={focus() ? focus().w : 0}
          height={focus() ? focus().h : 0}
          borderRadius={focus() ? focus().r : 16}
          color={focus() && focus().focusFill ? focus().focusFill : theme().accent}
          border={{ width: 1, color: hex((focus() && focus().focusEdge) || theme().onSurface) }}
        />
        <view
          alpha={focus() && focus().ring ? 1 : 0}
          x={focus() ? focus().x : 0}
          y={focus() ? focus().y : 0}
          width={focus() ? focus().w : 0}
          height={focus() ? focus().h : 0}
          borderRadius={12}
          color={theme().accentA(0.25)}
          border={{ width: 2, color: hex(theme().focus) }}
        />
        <Icons list={laid().icons} />
        <Texts list={laid().texts} />
        </view>
        </view>
      </view>
    </view>
  )
}
