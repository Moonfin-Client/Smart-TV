import { createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import { hex } from '../../color.js'
import { cssShift, fontFor, textWidth } from '../../text.js'

// A passive banner at the top right for a Seerr notification, a message sent from another client,
// an unlocked badge or a chat message. It never takes focus, fades and drops in over 220ms when a
// new one arrives, and asks its holder to drop it 7s later with onNoteDone(lane). `note` is
// { key, title, body?, icon? } (an image path) or null. Its colors are fixed, and no theme changes them.
const RIGHT = 1920 - 36
const TOP = 36
const MAX_W = 560
const ICON = 40
const ICON_GAP = 18
const LINE = 33
const AUTO_DISMISS_MS = 7000
const EDGE = { width: 1, color: hex('#ffffff2e') }
const ACCENT = { width: 4, color: hex('#00a4dcff') }

export default function NotificationToast(props) {
  const [shown, setShown] = createSignal(null)
  let node
  let timer = null
  let enterTimer = null
  onCleanup(() => {
    clearTimeout(timer)
    clearTimeout(enterTimer)
  })
  createEffect(
    on(
      () => props.note,
      (n) => {
        const was = shown()
        if (n && was && n.key === was.key) return
        clearTimeout(timer)
        clearTimeout(enterTimer)
        setShown(null)
        if (node) {
          node.alpha = 0
          node.y = -12
        }
        if (!n) return
        setShown(n)
        // A frame draws at the start of the drop-in before it moves.
        enterTimer = setTimeout(() => node && node.animate({ y: 0, alpha: 1 }, { duration: 220, easing: 'ease-out' }).start(), 0)
        timer = setTimeout(() => props.onNoteDone && props.onNoteDone(props.lane), AUTO_DISMISS_MS)
      },
    ),
  )
  const lead = () => (shown() && shown().icon ? ICON + ICON_GAP : 0)
  const title = () => (shown() && shown().title) || ''
  const body = () => (shown() && shown().body) || ''
  // The toast shrinks to fit its text, up to 560px, and the body wraps within what's left.
  const box = createMemo(() => {
    const n = shown()
    if (!n) return { w: 0, h: 0, textW: 0, x: RIGHT, iconY: 0, titleY: 0, bodyY: 0 }
    const titleW = textWidth(n.title || '', 26, 'bold')
    const bodyW = n.body ? textWidth(n.body, 22) : 0
    const cw = Math.min(MAX_W, lead() + Math.max(titleW, bodyW))
    const textW = cw - lead()
    const lines = n.body ? (bodyW <= textW ? 1 : 2) : 0
    const textH = LINE + (lines ? 6 + lines * LINE : 0)
    const ch = Math.max(lead() ? ICON : 0, textH)
    return {
      w: cw + 48 + 5,
      h: ch + 36 + 2,
      textW,
      x: RIGHT - (cw + 48 + 5),
      iconY: TOP + 19 + (ch - ICON) / 2,
      titleY: TOP + 19 + (ch - textH) / 2 + cssShift(26, fontFor(n.title || '', 'bold')),
      bodyY: TOP + 19 + (ch - textH) / 2 + LINE + 6 + cssShift(22, fontFor(n.body || '')),
    }
  })
  return (
    <view ref={node} x={box().x} y={-12} alpha={0}>
      <view y={36} width={box().w} height={box().h} borderRadius={8} color="#141414eb" border={EDGE} />
      <view y={36} width={box().w} height={box().h} borderRadius={8} color="#00000000" borderLeft={ACCENT} />
      <view x={28} y={box().iconY} width={40} height={40} src={(shown() && shown().icon) || ''} color="#00a4dcff" alpha={lead() ? 1 : 0} />
      <text
        fontFamily={fontFor(title(), 'bold')}
        fontSize={26}
        lineHeight={33}
        x={28 + lead()}
        y={box().titleY}
        maxWidth={box().textW}
        maxLines={1}
        color="#ffffffff"
      >
        {title() || ' '}
      </text>
      <text
        fontFamily={fontFor(body())}
        fontSize={22}
        lineHeight={33}
        x={28 + lead()}
        y={box().bodyY}
        maxWidth={box().textW}
        maxLines={2}
        color="#ffffffbf"
      >
        {body() || ' '}
      </text>
    </view>
  )
}
