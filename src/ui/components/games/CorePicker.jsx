import $L from '../../../services/i18n.js'
import { For, createMemo, createSignal } from 'solid-js'
import { fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'

// The core picker over the game details screen. Focus opens on the current core. Props: `choices`,
// `current`, `ref`. Calls onPick(core) and onPickerClose(), and keeps every key it gets.
// shortcut: the panel's backdrop blur is left out, which the dim almost hides anyway.
const ROW_PAD = 21
const EDGE = { width: 2, color: hex('#ffffff29') }

export default function CorePicker(props) {
  const [focused, setFocused] = createSignal(false)
  const rows = createMemo(() => {
    const list = (props.choices || []).map((c) => ({ id: c.core, label: c.label, detail: c.detail || '', selected: c.core === props.current }))
    list.push({ id: '__cancel', label: $L('Cancel'), detail: '', selected: false, divider: true })
    let y = 102
    return list.map((r, i) => {
      if (r.divider) y += 17
      const h = ROW_PAD * 2 + (r.detail ? 52 : 30)
      const at = y
      y += h
      return { ...r, i, y: at, h, dividerY: at - 9, labelFont: fontFor(r.label, 'bold'), detailFont: fontFor(r.detail) }
    })
  })
  const picked = rows().findIndex((r) => r.selected)
  const [cur, setCur] = createSignal(picked < 0 ? 0 : picked)
  const box = () => {
    const last = rows()[rows().length - 1]
    const h = (last ? last.y + last.h : 102) + 30 + 2
    return { h, y: (1080 - h) / 2 }
  }
  const t = theme
  const enter = () => {
    const r = rows()[cur()]
    if (!r) return true
    if (r.id === '__cancel') props.onPickerClose()
    else props.onPick(r.id)
    return true
  }
  return (
    <view
      ref={props.ref}
      width={1920}
      height={1080}
      onFocusChanged={setFocused}
      onUp={() => {
        if (cur() > 0) setCur(cur() - 1)
        return true
      }}
      onDown={() => {
        if (cur() < rows().length - 1) setCur(cur() + 1)
        return true
      }}
      onLeft={() => true}
      onRight={() => true}
      onEnter={enter}
      onBack={() => {
        props.onPickerClose()
        return true
      }}
    >
      <view width={1920} height={1080} color="#000000f2" />
      <view x={628} y={box().y} width={664} height={box().h} borderRadius={20} color="#181818f0" border={EDGE}>
        <text x={38} y={34.75} fontFamily={uiFont('bold')} fontSize={30} lineHeight={33} color="#ffffff">
          {$L('Choose core')}
        </text>
        <view x={2} y={83} width={660} height={1} color="#ffffff14" />
        <view>
          <For each={rows().filter((r) => r.divider)}>{(dv) => <view x={2} y={dv.dividerY} width={660} height={1} color="#ffffff14" />}</For>
        </view>
        <view>
          <For each={rows()}>
            {(r) => (
              <view x={2} y={r.y} width={660} height={r.h}>
                <view width={660} height={r.h} color={t().accentA(0.3)} alpha={focused() && r.i === cur() ? 1 : 0} />
                <view
                  x={36}
                  y={(r.h - 30) / 2}
                  width={30}
                  height={30}
                  src={r.selected ? 'icons/track_selected.webp' : 'icons/track_unselected.webp'}
                  color={r.selected ? t().accent : '#ffffff8c'}
                />
                <text x={84} y={r.detail ? 22.5 : 23.5} fontFamily={r.labelFont} fontSize={24} lineHeight={28} maxWidth={540} maxLines={1} color="#ffffff">
                  {r.label}
                </text>
                <text x={84} y={50} fontFamily={r.detailFont} fontSize={20} lineHeight={24} maxWidth={540} maxLines={1} color="#ffffffb3">
                  {r.detail}
                </text>
              </view>
            )}
          </For>
        </view>
      </view>
    </view>
  )
}
