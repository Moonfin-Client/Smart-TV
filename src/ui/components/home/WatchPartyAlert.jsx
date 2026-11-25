import $L from '../../../services/i18n.js'
import { createMemo, createSignal, onMount } from 'solid-js'
import { avatarColor } from '../party/feed.js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import { tx } from '../../fx.js'

// The alert for a Watch Party that just started: a card in the top right corner with the party's
// poster, who started it, what and how many, a note that it leads the Watch Parties row, and a bar
// that runs out over the eight seconds it shows. Home makes one per party, keyed by the room, and
// drops it when the time is up. It draws inside Home, so the nav and its clock still draw over it.
// Props: `head`, `line`, `host`, `poster` (partyRooms.alertOf).

const W = 642
const EDGE = { width: 1, color: 0x333333ff }
const COVER = { resizeMode: { type: 'cover' } }

export default function WatchPartyAlert(props) {
  const [lineH, setLineH] = createSignal(33)
  const [running, setRunning] = createSignal(false)
  const note = $L("It's first in Watch Parties on Home")
  // The text column starts after the poster, or at the padding without one.
  const textX = () => (props.poster ? 127 : 23)
  const textW = () => W - 2 - 22 - textX() + 1
  const initial = () => (String(props.host || '').charAt(0) || '?').toUpperCase()
  const fonts = createMemo(() => ({ head: fontFor(props.head, 'medium'), line: fontFor(props.line), initial: fontFor(initial(), 'bold') }))
  const bodyH = () => 44 + Math.max(props.poster ? 126 : 0, 38 + 8 + lineH() + 8 + 33)
  const h = () => bodyH() + 7
  onMount(() => setTimeout(() => setRunning(true), 0))
  return (
    <view x={1218} y={36} width={W} height={h()}>
      <view width={W} height={h()} borderRadius={20} color="#1e1e1eff" border={EDGE} />
      <view x={1} y={1} width={640} height={h() - 2} borderRadius={19} clipping>
        <view alpha={props.poster ? 1 : 0} x={22} y={22} width={84} height={126} borderRadius={10} src={props.poster || undefined} textureOptions={COVER} />
        <view x={textX() - 1} y={22} width={38} height={38} borderRadius={19} color={avatarColor(props.host)}>
          <text x={0} y={2.5 + cssShift(16)} fontFamily={fonts().initial} fontSize={16} lineHeight={33} maxWidth={38} contain="width" textAlign="center" color="#ffffffff">
            {initial()}
          </text>
        </view>
        <text
          x={textX() + 49}
          y={24.5 + cssShift(23)}
          fontFamily={fonts().head}
          fontSize={23}
          lineHeight={33}
          maxWidth={textW() - 50}
          maxLines={1}
          color="#ffffffff"
        >
          {props.head}
        </text>
        <text
          x={textX() - 1}
          y={68 + cssShift(20)}
          fontFamily={fonts().line}
          fontSize={20}
          lineHeight={33}
          maxWidth={textW()}
          color="#d6d6d6ff"
          onEvent={{ loaded: (_, e) => e && e.type === 'text' && e.dimensions.h && setLineH(e.dimensions.h) }}
        >
          {props.line}
        </text>
        <text x={textX() - 1} y={76 + lineH() + cssShift(18)} fontFamily={uiFont()} fontSize={18} lineHeight={33} maxWidth={textW()} color="#a8a8a8ff">
          {note}
        </text>
        <view y={bodyH()} width={640} height={5} color="#2a2a2aff">
          <view
            height={5}
            color="#00a4dcff"
            width={running() ? 0 : 640}
            transition={tx(running() ? { width: { duration: 8000, easing: 'linear' } } : undefined)}
          />
        </view>
      </view>
    </view>
  )
}
