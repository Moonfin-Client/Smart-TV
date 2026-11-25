import { For, Show, createMemo } from 'solid-js'
import * as player from '../../../state/audioPlayer.js'
import { fontFor } from '../../text.js'
import { trackArt } from './trackArt.js'

const { audio } = player

// The Sidebar owns its keys and passes `focus`: 0 for the art and text, which opens Now Playing,
// 1 to 4 for the buttons, or -1.
export const CARD_KEYS = ['open', 'previous', 'toggle', 'next', 'stop']

// How much room it takes in the sidebar's column, its 16px margin included.
export const sidebarMusicHeight = (open) => (open ? 16 + 1 + 12 + 64 + 12 + 48 + 12 + 1 : 16 + 56)

export default function SidebarMusicCard(props) {
  const art = createMemo(() => (audio.itemId ? trackArt(player.current()) : ''))
  const buttons = createMemo(() => {
    let x = (props.w - (40 * 3 + 48 + 8 * 3)) / 2
    return [
      { id: 'previous', icon: 'mus_p_previous', i: 1, s: 40, g: 22 },
      { id: 'toggle', icon: audio.playing ? 'mus_p_pause' : 'mus_p_play', i: 2, s: 48, g: 28 },
      { id: 'next', icon: 'mus_p_next', i: 3, s: 40, g: 22 },
      { id: 'stop', icon: 'mus_p_stop', i: 4, s: 40, g: 22 },
    ].map((b) => {
      const out = { ...b, x, y: 12 + 64 + 12 + (48 - b.s) / 2 }
      x += b.s + 8
      return out
    })
  })
  return (
    <view x={props.x} y={props.y} alpha={props.alpha}>
      <view>
        <Show when={!props.open}>
          <view x={1} y={16} width={56} height={56} borderRadius={28} color="#ffffff1a">
            <view x={12} y={12} width={32} height={32} src="icons/mus_note.webp" color="#ffffff80" />
          </view>
          <view>
            <Show when={art()}>
              <view x={1} y={16} width={56} height={56} borderRadius={28} src={art()} textureOptions={{ resizeMode: { type: 'cover' } }} />
            </Show>
          </view>
        </Show>
      </view>
      <view y={16} width={props.w} height={150} alpha={props.open ? 1 : 0}>
        <view width={props.w} height={150} borderRadius={16} color="#00000000" border={{ width: 1, color: 0xffffff26 }} />
        <view x={12} y={12} width={props.w - 24} height={64} borderRadius={10} color="#ffffff26" alpha={props.focus === 0 ? 1 : 0} />
        <view x={16} y={16} width={56} height={56} borderRadius={8} color="#ffffff1a">
          <view x={12} y={12} width={32} height={32} src="icons/mus_note.webp" color="#ffffff80" />
        </view>
        <view>
          <Show when={props.open && art()}>
            <view x={16} y={16} width={56} height={56} borderRadius={8} src={art()} textureOptions={{ resizeMode: { type: 'cover' } }} />
          </Show>
        </view>
        <text fontFamily={fontFor(audio.title, 'bold')} fontSize={16} x={84} y={22} maxWidth={props.w - 100} maxLines={1} color="#ffffffff">
          {audio.title}
        </text>
        <text fontFamily={fontFor(audio.artist)} fontSize={13} x={84} y={45} maxWidth={props.w - 100} maxLines={1} color="#ffffff99">
          {audio.artist}
        </text>
        <view>
          <For each={buttons()}>
            {(bt) => (
              <view
                x={bt.x}
                y={bt.y}
                width={bt.s}
                height={bt.s}
                borderRadius={bt.s / 2}
                color={props.focus === bt.i ? '#ffffffff' : '#ffffff1a'}
              >
                <view
                  x={(bt.s - bt.g) / 2}
                  y={(bt.s - bt.g) / 2}
                  width={bt.g}
                  height={bt.g}
                  src={'icons/' + bt.icon + '.webp'}
                  color={props.focus === bt.i ? '#111111ff' : '#ffffffff'}
                />
              </view>
            )}
          </For>
        </view>
      </view>
    </view>
  )
}
