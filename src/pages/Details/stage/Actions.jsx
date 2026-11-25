import { For, createEffect, createMemo, createSelector, createSignal, on } from 'solid-js'
import { textWidth } from '../../../ui/components/details/measure.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import { cssShift, themeSpacing, uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { holdPress } from '../../../utils/longPress.js'

// The `stacked` and `centered` action rows, driven by actionRow(). Stacked is Stage's column under
// the poster: the first button runs the full 388px and the rest sit under it as 86px circles.
// Centered is Premiere's row under its title: a labeled first button and 86.8px circles beside it,
// the row centered in `w`, or started at the left with `variant` 'start' for Quick Look. A focused
// circle shows its label under it.
//
// Props: `variant` ('stacked', 'centered' or 'start'), `buttons` [{id, icon, label, primary,
// active, long}], `w`, `held` (laid out but hidden until the page's loads settle), `tokens`, `x`,
// `y`, `ref`. Calls onAction(id), onActionLong(id), onActionFocus(id), and onActionsEdge(dir) for
// a press that leaves the row: Up and Down always, Left off the first button, Right off the last,
// and in the stacked column Right off Play too. Its node has current(), cur(), select(id),
// selectFirst() and go(i).
const STACKED = { leadW: 388, h: 86, gap: 14.66, rowGap: 24 }
const CENTERED = { h: 90, circle: 86.8, margin: 6.7 }
const LABEL_SHADOW = { color: '#00000080', x: 0, y: 1, blur: 4 }
const RING = hex('#ffffff59')
const GONE = { k: '', i: -1, x: 0, y: 0, w: 0, h: 0, r: 0, lead: false, fill: '#00000000', onFill: '#00000000', icon: 'icons/d/play.webp', iconX: 0, iconY: 0, ink: '#00000000', inkOn: '#00000000', label: '', labelX: 0, labelY: 0, labelSize: 20, labelW: 0, labelLh: 22, labelShadow: null }

// A circle that's on takes a wash of the accent, and a favorite takes red.
const lightColor = (b, t) => (b.id === 'favorite' ? '#e50914ff' : t.accent || '#00a4dcff')
const tint = (b, t) => (b.id === 'favorite' ? '#ff47572e' : t.accentA ? t.accentA(0.18) : '#00a4dc2e')

export const layoutActions = (buttons, variant, w) => {
  const list = buttons || []
  if (variant === 'stacked') {
    return list.map((b, i) => (i === 0
      ? { b, i, x: 0, y: 0, w: STACKED.leadW, h: STACKED.h, lead: true }
      : { b, i, x: (i - 1) * (STACKED.h + STACKED.gap), y: STACKED.h + STACKED.rowGap, w: STACKED.h, h: STACKED.h, lead: false }))
  }
  let x = 0
  const placed = list.map((b, i) => {
    const bw = i === 0 ? Math.min(467, 2 + 10 + 83.5 + 10 + Math.min(332, textWidth(b.label, 21.7, 'bold')) + 26.7 + 2) : CENTERED.circle
    const out = { b, i, x: x + CENTERED.margin, y: i === 0 ? 0 : (CENTERED.h - CENTERED.circle) / 2, w: bw, h: i === 0 ? CENTERED.h : CENTERED.circle, lead: i === 0 }
    x += bw + CENTERED.margin * 2
    return out
  })
  const shift = variant === 'start' ? -CENTERED.margin : Math.round(((w || 0) - x) / 2)
  return placed.map((p) => ({ ...p, x: p.x + shift }))
}

export default function StyledActions(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const buttons = () => props.buttons || []
  const t = () => props.tokens || { buttonFocused: '#fffffff2', onButtonFocused: '#0a0a12ff', focus: '#00a4dcff' }
  const stacked = () => props.variant === 'stacked'
  const bold = () => uiFont('bold')
  const isOn = createSelector(() => (focused() ? cur() : -1))

  const placed = createMemo(() => {
    const tk = t()
    const st = stacked()
    // Pixel themes square off the 38px radius.
    const r = tk.isPixel ? 0 : 38
    return layoutActions(buttons(), props.variant, props.w).map((p) => {
      const b = p.b
      const iconSize = 40
      const labelSize = p.lead ? (st ? 23.4 : 21.7) : 20
      const labelW = Math.min(p.lead ? (st ? 2000 : 332) : 267, textWidth(b.label, labelSize, 'bold'))
      let iconX = (p.w - iconSize) / 2
      let labelX = (p.w - labelW) / 2
      // 10px under the focused circle's padding box, inside its 4px border.
      let labelY = p.h - 4 + 10 + 1
      if (p.lead && st) {
        iconX = (p.w - (iconSize + 13 + labelW)) / 2
        labelX = iconX + iconSize + 13
        labelY = (p.h - 25.74) / 2
      } else if (p.lead) {
        iconX = 2 + 10 + (83.5 - iconSize) / 2
        labelX = 2 + 10 + 83.5 + 10
        labelY = (p.h - 23.87) / 2
      }
      const lit = b.active && !p.lead
      return {
        k: b.id, i: p.i, x: p.x, y: p.y, w: p.w, h: p.h, r, lead: p.lead,
        fill: lit ? tint(b, tk) : '#ffffff0f',
        onFill: lit ? tint(b, tk) : tk.buttonFocused,
        icon: `icons/d/${b.icon}.webp`, iconX, iconY: (p.h - iconSize) / 2,
        ink: lit ? lightColor(b, tk) : '#ffffffff',
        inkOn: lit ? lightColor(b, tk) : tk.onButtonFocused,
        label: b.label, labelX, labelY: labelY + cssShift(labelSize), labelSize, labelW: labelW + 12,
        labelLh: p.lead ? labelSize * 1.1 : 22, labelShadow: p.lead ? null : LABEL_SHADOW,
      }
    })
  })
  const items = byKey(placed, GONE)
  // The row's own box, with room for the labels under the circles, so a scrolled page doesn't cull it.
  const span = createMemo(() => placed().reduce((a, p) => ({ w: Math.max(a.w, p.x + p.w), h: Math.max(a.h, p.y + p.h + 40) }), { w: 0, h: 0 }))

  const current = () => buttons()[cur()]
  const notify = () => {
    const b = current()
    if (b && props.onActionFocus) props.onActionFocus(b.id)
  }
  const go = (i) => {
    setCur(i)
    notify()
    return true
  }
  const edge = (dir) => {
    if (props.onActionsEdge) props.onActionsEdge(dir)
    return true
  }
  createEffect(
    on(buttons, (list) => {
      if (cur() >= list.length) setCur(Math.max(0, list.length - 1))
    }),
  )

  // Play and Resume open Advanced Playback when held, so they act on release.
  const hold = holdPress()

  return (
    <view
      ref={(n) => {
        n.current = current
        n.cur = cur
        n.select = (id) => {
          const i = buttons().findIndex((b) => b.id === id)
          if (i >= 0) setCur(i)
        }
        n.selectFirst = () => setCur(0)
        n.go = go
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={span().w}
      height={span().h}
      alpha={props.held ? 0 : 1}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) notify()
        else {
          // A hold that opened Advanced Playback ends there, and its release goes to the sheet.
          hold.cancel()
        }
      }}
      // The stacked column's own moves: Up off a circle goes to Play, Down from Play to the first
      // circle, Right from Play or the last circle to the page.
      onUp={() => (stacked() && cur() > 0 ? go(0) : edge('up'))}
      onDown={() => (stacked() && cur() === 0 && buttons().length > 1 ? go(1) : edge('down'))}
      onLeft={() => (cur() > 0 ? go(cur() - 1) : edge('left'))}
      onRight={() => {
        const last = cur() === buttons().length - 1
        if (stacked() && (cur() === 0 || last)) return edge('right')
        return last ? edge('right') : go(cur() + 1)
      }}
      onEnter={() => {
        const b = current()
        if (!b) return true
        if (!b.long) {
          if (props.onAction) props.onAction(b.id)
          return true
        }
        hold.start(b, () => {
          if (props.onActionLong) props.onActionLong(b.id)
        })
        return true
      }}
      onMenu={() => {
        const b = current()
        if (!b || !b.long || !props.onActionLong) return false
        props.onActionLong(b.id)
        return true
      }}
      onEnterRelease={() => {
        return hold.end((b) => {
          if (props.onAction) props.onAction(b.id)
        })
      }}
    >
      <For each={items.keys()}>
        {(k) => {
          const b = () => items.at(k)
          const on = () => isOn(b().i)
          return (
            <view x={b().x} y={b().y} width={b().w} height={b().h}>
              <view width={b().w} height={b().h} borderRadius={b().r} color={b().fill} border={{ width: 2, color: RING }} alpha={on() ? 0 : 1} />
              <view width={b().w} height={b().h} borderRadius={b().r} color={b().onFill} border={{ width: 4, color: hex(t().focus) }} alpha={on() ? 1 : 0} />
              <view x={b().iconX} y={b().iconY} width={40} height={40} src={b().icon} color={on() ? b().inkOn : b().ink} />
              <text
                x={b().labelX}
                y={b().labelY}
                fontFamily={bold()}
                fontSize={b().labelSize}
                lineHeight={b().labelLh}
                letterSpacing={themeSpacing()}
                maxWidth={b().labelW}
                maxLines={1}
                color={b().lead && on() ? b().inkOn : b().lead ? b().ink : '#ffffffff'}
                alpha={b().lead || on() ? 1 : 0}
                textShadow={b().labelShadow || undefined}
              >
                {b().label}
              </text>
            </view>
          )
        }}
      </For>
    </view>
  )
}
