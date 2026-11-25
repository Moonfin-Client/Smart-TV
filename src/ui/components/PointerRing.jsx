import { Show } from 'solid-js'
import { pointerRing } from '../../app/pointer.js'
import { theme } from '../theme.js'
import { hex } from '../color.js'

// The ring around the control under the Magic Remote's cursor, for controls that don't take focus on
// hover (app/pointer.js, pointerRing).
export default function PointerRing() {
  return (
    <Show when={pointerRing()}>
      {(r) => (
        <view
          pointerSkip
          x={r().x}
          y={r().y}
          width={r().w}
          height={r().h}
          borderRadius={r().radius}
          border={{ width: theme().focusWidth || 3, color: hex(theme().focus) }}
        />
      )}
    </Show>
  )
}
