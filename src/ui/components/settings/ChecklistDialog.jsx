import $L from '../../../services/i18n.js'
import { For, createMemo, createSelector, createSignal } from 'solid-js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'
import { rowFont, rowUiFont } from './rowFont.js'
import { checklistTitleLook } from './faces.js'
import { dp, textWidth } from './look.js'
import { COLUMN_W } from './layoutRows.js'
import { fx, EASE_OUT } from './fx.js'

// The settings checklist, an alert dialog as wide as the column lets it be: Select All, Clear and
// Save over the list, Cancel under it. The ticked rows lead, ordered once on open, and picks keep
// the order they were made in. At [max] the unticked
// rows dim and ignore a tick but can still take focus. It calls onChecklistSave(picked) and
// onChecklistCancel() on its holder, and leaves Back to it. Its node has start(options, picked,
// max, sortByLabel).
const PAD_X = dp(40)
const PAD_Y = dp(24)
const TITLE_TOP = dp(24)
const TITLE_LH = dp(18) * 1.273
const BTN_ROW_H = dp(48)
const BTN_ROW_TOP = dp(16)
const ROW_H = dp(40) + 2 * dp(1)
const ACTIONS_MARGIN = dp(24)
const LIST_TOP = TITLE_TOP + TITLE_LH + BTN_ROW_TOP + BTN_ROW_H

const byLabel = (a, b) => {
  const left = String(a.label).toLowerCase()
  const right = String(b.label).toLowerCase()
  return left < right ? -1 : left > right ? 1 : 0
}

export default function ChecklistDialog(props) {
  const [rows, setRows] = createSignal([])
  const [working, setWorking] = createSignal([])
  const [max, setMax] = createSignal(null)
  const [cur, setCur] = createSignal(0)
  const [zone, setZone] = createSignal('list')
  const [btn, setBtn] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)
  const p = () => props.p
  const colH = () => props.colH || 883
  const sq = (r) => (theme().isPixel ? 0 : r)
  const look = createMemo(() => checklistTitleLook(props.title || ''))
  const btnFont = () => rowUiFont('medium')
  const buttons = createMemo(() => {
    const list = []
    if (max() == null) list.push({ id: 'all', label: $L('Select All') })
    list.push({ id: 'clear', label: $L('Clear') })
    list.push({ id: 'save', label: $L('Save'), filled: true })
    const widths = list.map((b) => Math.max(dp(64), textWidth(b.label, dp(14), 'medium') + 2 * (b.filled ? dp(24) : dp(12))))
    const total = widths.reduce((a, w) => a + w, 0) + (list.length - 1) * dp(8)
    let x = ((COLUMN_W - 2 * PAD_X) - total) / 2
    return list.map((b, i) => {
      const out = { ...b, i, x, w: widths[i] }
      x += widths[i] + dp(8)
      return out
    })
  })
  const cancelLabel = $L('Cancel')
  const cancelW = Math.max(dp(64), textWidth(cancelLabel, dp(14), 'medium') + 2 * dp(12))
  const full = () => max() != null && working().length >= max()
  const listH = () => rows().length * ROW_H
  const viewH = () => Math.max(0, Math.min(listH(), colH() - 2 * PAD_Y - LIST_TOP - 2 * ACTIONS_MARGIN - BTN_ROW_H))
  const height = () => LIST_TOP + viewH() + 2 * ACTIONS_MARGIN + BTN_ROW_H
  const border = () => p().dialogBorder || { w: 0, color: '#00000000' }
  const focusRow = createSelector(() => (zone() === 'list' ? cur() : -1))
  const focusBtn = createSelector(() => (zone() === 'buttons' ? btn() : -1))
  const ticked = (v) => working().indexOf(v) >= 0
  const innerW = (COLUMN_W - 2 * PAD_X) - 80.14

  const follow = () => {
    const wanted = cur() * ROW_H - 0.9 * (viewH() - ROW_H)
    setScroll(Math.max(0, Math.min(Math.max(0, listH() - viewH()), wanted)))
  }
  const toggle = (value) => {
    const now = working()
    if (now.indexOf(value) >= 0) setWorking(now.filter((v) => v !== value))
    else if (max() == null || now.length < max()) setWorking(now.concat(value))
  }
  const press = (id) => {
    if (id === 'all') setWorking(working().concat(rows().map((r) => r.value).filter((v) => working().indexOf(v) < 0)))
    else if (id === 'clear') setWorking([])
    else if (id === 'save' && props.onChecklistSave) props.onChecklistSave(working())
  }
  // [options] are {value, label}, [picked] the values ticked now.
  const start = (options, picked, limit, sortByLabel) => {
    const list = sortByLabel ? [...options].sort(byLabel) : [...options]
    const has = (v) => (picked || []).indexOf(v) >= 0
    setRows(list.filter((o) => has(o.value)).concat(list.filter((o) => !has(o.value))).map((r, i) => ({ ...r, i, label: String(r.label) })))
    setWorking([...(picked || [])])
    setMax(limit == null ? null : limit)
    setCur(0)
    setScroll(0)
    setBtn(buttons().length - 1)
    setZone(rows().length ? 'list' : 'buttons')
  }
  return (
    <view
      ref={(n) => {
        n.start = start
        if (props.ref) props.ref(n)
      }}
      width={COLUMN_W}
      height={colH()}
      onUp={() => {
        if (zone() === 'list') {
          if (cur() > 0) {
            setCur(cur() - 1)
            follow()
          } else setZone('buttons')
        } else if (zone() === 'cancel') setZone(rows().length ? 'list' : 'buttons')
        return true
      }}
      onDown={() => {
        if (zone() === 'buttons') setZone(rows().length ? 'list' : 'cancel')
        else if (zone() === 'list') {
          if (cur() < rows().length - 1) {
            setCur(cur() + 1)
            follow()
          } else setZone('cancel')
        }
        return true
      }}
      onLeft={() => {
        if (zone() === 'buttons' && btn() > 0) setBtn(btn() - 1)
        return true
      }}
      onRight={() => {
        if (zone() === 'buttons' && btn() < buttons().length - 1) setBtn(btn() + 1)
        return true
      }}
      onEnter={() => {
        if (zone() === 'list') {
          const r = rows()[cur()]
          if (r) toggle(r.value)
        } else if (zone() === 'buttons') press(buttons()[btn()].id)
        else if (zone() === 'cancel' && props.onChecklistCancel) props.onChecklistCancel()
        return true
      }}
    >
      <view width={COLUMN_W} height={colH()} borderRadius={33.39} color="#0000008a" />
      <view
        x={66.78}
        y={(colH() - height()) / 2}
        width={(COLUMN_W - 2 * PAD_X)}
        height={height()}
        borderRadius={p().dialogRadius}
        color={p().dialog}
        border={border().w ? { width: border().w, color: hex(border().color) } : undefined}
      >
        <text
          fontFamily={look().font}
          fontSize={look().size}
          lineHeight={38.25}
          x={40.07}
          y={42.62 + look().dy}
          maxWidth={(COLUMN_W - 2 * PAD_X) - 80.14}
          maxLines={1}
          letterSpacing={look().spacing}
          textShadow={look().shadow}
          color={look().color || '#e6e0e9'}
        >
          {props.title || ' '}
        </text>
        <For each={buttons()}>
          {(b) => (
            <view x={b.x} y={40.07 + 38.25 + 26.71 + 6.68} width={b.w} height={66.78} onPointerOver={() => (setZone('buttons'), setBtn(b.i))}>
              <view width={b.w} height={66.78} borderRadius={sq(b.filled ? 13.36 : 33.39)} color={b.filled ? p().buttonNormal : '#00000000'} />
              <view
                width={b.w}
                height={66.78}
                borderRadius={sq(b.filled ? 13.36 : 33.39)}
                color={b.filled ? '#ffffff1a' : p().accentTen}
                alpha={focusBtn(b.i) ? 1 : 0}
              />
              <text fontFamily={btnFont()} fontSize={23.37} lineHeight={27.39} x={b.w / 2} mountX={0.5} y={21.69} color={b.filled ? p().onButtonNormal : p().accent}>
                {b.label}
              </text>
            </view>
          )}
        </For>
        <view x={40.07} y={LIST_TOP} width={innerW} height={viewH()} clipping>
          <view transition={fx('y', 120, EASE_OUT)} y={-scroll()} width={innerW} height={Math.max(viewH(), listH())}>
            <For each={rows()}>
              {(r) => {
                const lit = () => focusRow(r.i)
                const on = () => ticked(r.value)
                return (
                  <view
                    y={r.i * ROW_H + dp(1)}
                    width={innerW}
                    height={66.78}
                    borderRadius={sq(20.03)}
                    color={lit() ? p().tileFocusFill : '#00000000'}
                    onPointerOver={() => (setZone('list'), setCur(r.i))}
                  >
                    <view
                      x={31.73}
                      y={18.37}
                      width={30.05}
                      height={30.05}
                      borderRadius={3.34}
                      color="#00000000"
                      border={{ width: 3.01, color: hex(lit() ? '#000000cc' : p().accent) }}
                      alpha={on() ? 0 : 1}
                    />
                    <view x={31.73} y={18.37} width={30.05} height={30.05} borderRadius={3.34} color={lit() ? p().strong : p().accent} alpha={on() ? 1 : 0} />
                    <view x={34.2} y={20.8} width={25} height={25} src="icons/settings/check.webp" alpha={on() ? 1 : 0} color={lit() ? '#ffffff' : p().onAccent} />
                    <text
                      fontFamily={rowFont(r.label, 'bold')}
                      fontSize={21.7}
                      lineHeight={25.39}
                      x={103.5}
                      y={22.54}
                      maxWidth={innerW - 116}
                      maxLines={1}
                      alpha={full() && !on() ? 0.4 : 1}
                      color={lit() ? p().strong : p().onSurface}
                    >
                      {r.label || ' '}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
        </view>
        <view
          x={(COLUMN_W - 2 * PAD_X) - 40.07 - cancelW}
          y={LIST_TOP + viewH() + 40.07 + 6.68}
          width={cancelW}
          height={66.78}
          onPointerOver={() => setZone('cancel')}
        >
          <view width={cancelW} height={66.78} borderRadius={33.39} color={p().accentTen} alpha={zone() === 'cancel' ? 1 : 0} />
          <text fontFamily={btnFont()} fontSize={23.37} lineHeight={27.39} x={cancelW / 2} mountX={0.5} y={21.69} color={p().accent}>
            {cancelLabel}
          </text>
        </view>
      </view>
    </view>
  )
}
