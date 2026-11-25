import $L from '../../../services/i18n.js'
import { For, createSelector, createSignal, untrack } from 'solid-js'
import { textWidth } from '../../../ui/components/details/measure.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import { cssShift, fontFor, themeSpacing, uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { stageTrackChoices } from './stageRules.js'
import { pointerFocus } from '../../../app/pointer.js'

// The audio, subtitle and version pickers as 68px pills with what each is set to. With `shareRow`
// they split one row between them and leave their names off, for Quick Look's narrow column.
//
// Props: `tokens`, `x`, `y`, `alpha`, `ref`. Its node has draw({props, w, shareRow}), which lays it
// out from stageTrackChoices' props and returns its height (0 when there's nothing to pick), ids()
// (the chips in order) and focusFirst(). Calls onChip(id) on OK, onChipsEdge(dir) for Up and Down,
// and Left off the first or Right off the last chip.
const H = 68
const GAP = 17
const LOOKS = {
  audio: { label: () => $L('Audio'), icon: 'audio' },
  subtitles: { label: () => $L('Subtitles'), icon: 'subtitle' },
  version: { label: () => $L('Version'), icon: 'version' },
}
const EDGE = hex('#ffffff38')
const GONE = { k: '', i: -1, x: 0, y: 0, w: 0, label: '', labelW: 0, labelY: 0, value: '', valueFont: 'roboto', vw: 0, icon: 'audio' }

const trackChipsLayout = (choices, w, shareRow) => {
  const share = shareRow ? w / choices.length - 13.4 : 0
  let x = 0
  let y = 0
  const out = choices.map((c) => {
    const label = shareRow ? '' : LOOKS[c.id].label()
    const labelW = label ? textWidth(label, 20) + 13 : 0
    const valueW = Math.min(400, textWidth(c.current, 23.4, 'bold'))
    // The outer 1s are the chip's 1px border on each side.
    let cw = 1 + 23 + 30 + 13 + labelW + valueW + 23 + 1
    let vw = valueW
    if (shareRow && cw > share) {
      vw = Math.max(0, valueW - (cw - share))
      cw = share
    }
    if (!shareRow && x > 0 && x + cw > w) {
      x = 0
      y += H + GAP
    }
    // A value that doesn't fit is cut at its box. One that fits gets room to spare, so a rounding
    // never cuts it.
    const chip = { id: c.id, x, y, w: cw, label, labelW, value: c.current, vw, cut: textWidth(c.current, 23.4, 'bold') > vw, icon: LOOKS[c.id].icon }
    x += cw + (shareRow ? 13.4 : GAP)
    return chip
  })
  return { chips: out, h: out.length ? y + H : 0 }
}

export default function StageChips(props) {
  const [chips, setChips] = createSignal([])
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const [box, setBox] = createSignal({ w: 0, h: 0 })
  const t = () => props.tokens || { focus: '#00a4dcff' }
  const regular = () => uiFont('regular')
  const isOn = createSelector(() => (focused() ? cur() : -1))
  const list = byKey(chips, GONE)

  const draw = ({ props: choiceProps, w, shareRow }) =>
    untrack(() => {
      const laid = trackChipsLayout(stageTrackChoices(choiceProps), w, shareRow)
      const next = laid.chips.map((c, i) => ({ ...c, k: c.id, i, valueFont: fontFor(c.value, 'bold'), labelY: 17.5 + cssShift(20) }))
      setChips(next)
      setBox({ w, h: laid.h })
      if (cur() >= next.length) setCur(0)
      return laid.h
    })
  const edge = (dir) => {
    if (props.onChipsEdge) props.onChipsEdge(dir)
    return true
  }

  return (
    <view
      // The Magic Remote's cursor focuses the chip under it, and OK then uses it (app/pointer.js).
      onPointerChildOver={(i, child) => {
        pointerFocus(child.parent)
        const c = list.at(list.keys()[i])
        if (c && c.i !== cur()) setCur(c.i)
      }}
      ref={(n) => {
        n.draw = draw
        n.ids = () => chips().map((c) => c.id)
        n.focusFirst = () => setCur(0)
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={box().w}
      height={box().h}
      alpha={props.alpha == null ? 1 : props.alpha}
      onFocusChanged={setFocused}
      onLeft={() => {
        if (cur() > 0) setCur(cur() - 1)
        else edge('left')
        return true
      }}
      onRight={() => {
        if (cur() < chips().length - 1) setCur(cur() + 1)
        else edge('right')
        return true
      }}
      onUp={() => edge('up')}
      onDown={() => edge('down')}
      onEnter={() => {
        const c = chips()[cur()]
        if (c && props.onChip) props.onChip(c.id)
        return true
      }}
    >
      <For each={list.keys()}>
        {(k) => {
          const c = () => list.at(k)
          const on = () => isOn(c().i)
          return (
            <view x={c().x} y={c().y} width={c().w} height={H}>
              <view width={c().w} height={H} borderRadius={34} color="#ffffff0f" border={{ width: 1, color: EDGE }} alpha={on() ? 0 : 1} />
              <view width={c().w} height={H} borderRadius={34} color="#f2f2f2ff" border={{ width: 1, color: hex(t().focus) }} alpha={on() ? 1 : 0} />
              <view x={24} y={19} width={30} height={30} src={`icons/d/${c().icon}.webp`} color={on() ? '#2121219e' : '#ffffff9e'} />
              <text alpha={c().label ? 1 : 0} x={67} y={c().labelY} fontFamily={regular()} fontSize={20} lineHeight={33} letterSpacing={themeSpacing()} color={on() ? '#2121219e' : '#ffffff9e'}>
                {c().label}
              </text>
              <text
                x={67 + c().labelW}
                y={c().labelY}
                fontFamily={c().valueFont}
                fontSize={23.4}
                lineHeight={33}
                letterSpacing={themeSpacing()}
                maxWidth={c().cut ? c().vw : c().vw + 12}
                maxLines={1}
                color={on() ? '#212121ff' : '#ffffffff'}
              >
                {c().value}
              </text>
            </view>
          )
        }}
      </For>
    </view>
  )
}
