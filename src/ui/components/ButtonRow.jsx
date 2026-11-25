import { For, createMemo, createSelector, createSignal } from 'solid-js'
import Button, { neutralWidth, pillWidth } from './Button.jsx'

// Buttons laid out left to right with their own Left and Right focus. Enter calls
// onButton(id, button) on the holder. Left from the first button is the holder's, Right past the
// last stops. A `neutral` button (see Button) is sized to its label and sits 36px from the next.
export default function ButtonRow(props) {
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(cur)
  const buttons = () => props.buttons || []
  const placed = createMemo(() => {
    const gap = props.gap || 20
    let x = 0
    const at = {}
    buttons().forEach((b) => {
      const w = b.w || (b.neutral ? neutralWidth(b.label, b.small) : pillWidth(b.label, b.icon))
      at[b.id] = { x, w }
      x += w + (b.neutral ? 36 : gap)
    })
    return at
  })
  const current = () => buttons()[cur()]
  const select = (id) => {
    const i = buttons().findIndex((b) => b.id === id)
    if (i >= 0) setCur(i)
  }
  return (
    <view
      ref={(n) => {
        n.select = select
        n.current = current
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      onFocusChanged={setFocused}
      onLeft={() => {
        if (cur() === 0) return false
        setCur(cur() - 1)
        return true
      }}
      onRight={() => {
        if (cur() < buttons().length - 1) setCur(cur() + 1)
        return true
      }}
      onEnter={() => {
        const b = current()
        if (b && props.onButton) props.onButton(b.id, b)
        return true
      }}
    >
      <For each={buttons()}>
        {(b, i) => (
          <Button
            x={placed()[b.id].x}
            w={placed()[b.id].w}
            label={b.label}
            icon={b.icon}
            primary={b.primary}
            neutral={b.neutral}
            small={b.small}
            selected={b.selected}
            disabled={b.disabled}
            focused={focused() && isCur(i())}
          />
        )}
      </For>
    </view>
  )
}
