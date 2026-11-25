import { createEffect, createMemo, createSignal, on } from 'solid-js'
import { fontFor, normalShift, textWidth } from '../text.js'
import { theme } from '../theme.js'
import { hex } from '../color.js'
import { getStore } from '../../state/store.js'
import { tx } from '../fx.js'

// Shows store.toast: a box centered 60px off the bottom with a hairline of the surface text color,
// rising 16px as it fades in over the first 8% of its 3s and sinking back out over the last 17%.
// toast() holds the message for the 2.49s before that.
// shortcut: one line, and no 16px backdrop blur behind it, add them if a toast ever needs either.
export default function Toast() {
  const store = getStore()
  const [msg, setMsg] = createSignal('')
  const [shown, setShown] = createSignal(false)
  createEffect(
    on(
      () => store.toast,
      (v) => {
        if (v) setMsg(v)
        setShown(!!v)
      },
    ),
  )
  const boxW = createMemo(() => Math.round(textWidth(msg(), 18, 'medium')) + 58)
  const duration = () => (shown() ? 240 : 510)
  return (
    <view
      x={960 - boxW() / 2}
      y={shown() ? 969 : 985}
      alpha={shown() ? 1 : 0}
      transition={tx({ y: { duration: duration(), easing: 'ease' }, alpha: { duration: duration(), easing: 'ease' } })}
    >
      <view width={boxW()} height={51} borderRadius={12} color="#1e1e28e6" border={{ width: 1, color: hex(theme().os(0.12)) }} />
      <text
        x={29}
        y={15 + normalShift(18)}
        fontFamily={fontFor(msg(), 'medium')}
        fontSize={18}
        lineHeight={18}
        maxWidth={902}
        maxLines={1}
        color={theme().textPrimary}
      >
        {msg() || ' '}
      </text>
    </view>
  )
}
