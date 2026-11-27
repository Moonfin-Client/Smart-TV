import { For, Show, createEffect, createMemo, createSelector, createSignal, on } from 'solid-js'
import * as player from '../../../state/audioPlayer.js'
import * as settings from '../../../state/settings.js'
import { fontFor, textWidth } from '../../text.js'
import { theme, rgba } from '../../theme.js'
import { hex } from '../../color.js'
import { focusActivePage } from '../../../state/pages.js'
import { focusNav } from '../../../app/focus.js'
import { router } from '../../../app/router.js'
import { trackArt } from './trackArt.js'
import LoopMarquee from '../home/LoopMarquee.jsx'

const { audio } = player
const H = 90
// Play and Pause share the second button, which only swaps its icon.
const CONTROLS = [
  { id: 'previous', icon: 'mus_p_previous', i: 1 },
  { id: 'toggle', icon: '', i: 2 },
  { id: 'next', icon: 'mus_p_next', i: 3 },
  { id: 'stop', icon: 'mus_p_stop', i: 4 },
]

// Each top nav style draws it inside its bar, passing where the bar ends (`barBottom`), its fill
// (`surface`) and text color (`ink`), so it fades with the nav, and focuses it with focusPill() on
// its node. With the sidebar nav the music sits in the sidebar instead.
export default function MiniPlayer(props) {
  const [cur, setCur] = createSignal(0)
  const [active, setActive] = createSignal(false)
  const isOn = createSelector(() => (active() ? cur() : null))
  let root
  const shown = () => audio.active && settings.get('navbarPosition') !== 'left'
  const ink = () => props.ink || '#ffffffff'
  const line = () => (audio.artist ? `${audio.title} - ${audio.artist}` : audio.title)
  // The marquee gets a pixel more than this, since the renderer's own measure can come out a fraction wider.
  const titleW = createMemo(() => Math.min(560, Math.ceil(textWidth(line(), 26, 'bold'))))
  // A 1px border, padding 32, the art 64, 12 to the title box with its own 12 a side, 28 to four 64px buttons 8 apart.
  const w = () => 1 + 32 + 64 + 12 + 12 + titleW() + 12 + 28 + 4 * 64 + 3 * 8 + 32 + 1
  const btnX = () => 1 + 32 + 64 + 12 + 12 + titleW() + 12 + 28
  const art = createMemo(() => (audio.itemId ? trackArt(player.current()) : ''))
  const fill = () => {
    if (props.surface) return props.surface
    return theme().id === 'glass' ? rgba('#ffffff', 0.08) : theme().navFill
  }
  const iconOf = (ct) => (ct.id !== 'toggle' ? ct.icon : audio.playing ? 'mus_p_pause' : 'mus_p_play')
  createEffect(
    on(shown, (on) => {
      if (!on && active()) focusActivePage()
    }),
  )
  const focusPill = () => {
    if (!shown()) return focusActivePage()
    setCur(0)
    root.setFocus()
  }
  // The Magic Remote's cursor focuses the pill and the part under it, and OK then uses it
  // (app/pointer.js).
  const point = (i) => {
    if (!shown()) return
    if (cur() !== i) setCur(i)
    if (!active()) root.setFocus()
  }
  return (
    <view
      ref={(n) => {
        root = n
        n.focusPill = focusPill
        if (props.ref) props.ref(n)
      }}
      x={Math.round(960 - w() / 2)}
      y={(props.barBottom != null ? Number(props.barBottom) : 122) + 16}
      width={w()}
      height={H}
      alpha={shown() ? 1 : 0}
      onFocusChanged={setActive}
      onLeft={() => {
        if (cur() > 0) setCur(cur() - 1)
        return true
      }}
      onRight={() => {
        if (cur() < 4) setCur(cur() + 1)
        return true
      }}
      onEnter={() => {
        if (cur() === 0) router.to('/nowplaying')
        else player[CONTROLS[cur() - 1].id]()
        return true
      }}
      onUp={() => {
        focusNav()
        return true
      }}
      onDown={() => {
        focusActivePage()
        return true
      }}
      onBack={() => {
        focusActivePage()
        return true
      }}
    >
      <view width={w()} height={H} borderRadius={45} color={fill()} border={{ width: 1, color: hex(theme().os(0.15)) }} />
      <view x={33} y={13} width={64} height={64} borderRadius={12} color="#ffffff1a">
        <view x={12} y={12} width={40} height={40} src="icons/mus_note.webp" color="#ffffff80" />
      </view>
      <view>
        <Show when={art()} keyed>
          {(src) => (
            <view x={33} y={13} width={64} height={64} borderRadius={12} src={src} textureOptions={{ resizeMode: { type: 'cover' } }} />
          )}
        </Show>
      </view>
      <view
        x={109}
        y={20.5}
        width={titleW() + 24}
        height={49}
        borderRadius={16}
        color="#ffffff38"
        alpha={isOn(0) ? 1 : 0}
      />
      <LoopMarquee
        x={121}
        y={28.5}
        text={line()}
        font={fontFor(line(), 'bold')}
        size={26}
        lh={33}
        ink={ink()}
        width={titleW() + 1}
        active
        weight="bold"
      />
      <view x={33} y={13} width={titleW() + 100} height={64} onPointerOver={() => point(0)} />
      <view>
        <For each={CONTROLS}>
          {(ct) => (
            <view
              x={btnX() + (ct.i - 1) * 72}
              y={13}
              width={64}
              height={64}
              borderRadius={32}
              color={isOn(ct.i) ? '#ffffffff' : '#ffffff00'}
              onPointerOver={() => point(ct.i)}
            >
              <view
                x={12}
                y={12}
                width={40}
                height={40}
                src={'icons/' + iconOf(ct) + '.webp'}
                color={isOn(ct.i) ? '#111111ff' : ink()}
              />
            </view>
          )}
        </For>
      </view>
    </view>
  )
}
