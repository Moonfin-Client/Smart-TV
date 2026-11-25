import { Show } from 'solid-js'
import { hex } from '../../color.js'
import { tx } from '../../fx.js'
import { Disc } from './LibraryTile.jsx'

const RING = { width: 3, color: hex('#ffffff') }
const COVER = { resizeMode: { type: 'cover' } }
const CLEAR = '#00000000'

export default function FavoriteTile(props) {
  const o = () => props.opts || {}
  const c = () => props.card || {}
  // The poster's 3px border sits outside its width and height, so the box is 6 more each way than
  // the card. The title and subtitle sit under the box, in the textH the page made room for.
  const bw = () => o().cardW + 6
  const bh = () => o().posterH + 6
  // A person's or artist's picture is rounded off, but its empty placeholder keeps the 8px corners.
  // shortcut: the renderer can't draw an ellipse, so a tall round card comes out as a pill. Add an
  // ellipse mask if people's cards need a true ellipse.
  const r = () => (c().round && c().image ? bw() / 2 : 8)
  const ease = () => ({ duration: o().ms || 0, easing: 'ease' })
  return (
    <view
      x={10}
      y={10}
      width={o().cardW}
      height={bh() + (o().textH || 6)}
      pivot={0.5}
      scale={props.focused ? 1.05 : 1}
      transition={tx({ scale: ease() })}
    >
      <view width={bw()} height={bh()} borderRadius={r()} color="#ffffff0d" />
      <view>
        <Show
          when={c().image}
          fallback={
            <view
              x={(bw() - 60) / 2}
              y={(bh() - 60) / 2}
              width={60}
              height={60}
              src={'icons/' + (c().icon || 'lib_movie') + '.webp'}
              color="#ffffff4d"
            />
          }
        >
          <view x={3} y={3} width={o().cardW} height={o().posterH} borderRadius={r() - 3} src={c().image} textureOptions={COVER} />
        </Show>
      </view>
      {/* Only the artwork rings, so a placeholder grows without one. */}
      <view width={bw()} height={bh()} borderRadius={r()} color={CLEAR} border={RING} alpha={props.focused && c().image ? 1 : 0} transition={tx({ alpha: ease() })} />
      <view>
        <Show when={c().played}>
          <Disc x={o().cardW - 36} y={8} fill={o().watchedBg} icon="icons/lib_check.webp" ink={o().onBadge} />
        </Show>
      </view>
      <view>
        <Show when={c().server}>
          <view x={8} y={8} width={c().serverW} height={29} borderRadius={4} color="#000000bf">
            <text fontFamily={c().serverFont} fontSize={18} x={10} y={4} lineHeight={21} maxWidth={c().serverW - 20} maxLines={1} color="#ffffff">
              {c().server}
            </text>
          </view>
        </Show>
      </view>
      <view>
        <Show when={o().showText && props.card}>
          <text fontFamily={c().titleFont} fontSize={19} y={bh() + 4} lineHeight={22.8} maxWidth={bw()} maxLines={1} color="#ffffff">
            {c().title || ''}
          </text>
          <Show when={c().subtitle}>
            <text fontFamily={c().subtitleFont} fontSize={17} y={bh() + 26.8} lineHeight={20.4} maxWidth={bw()} maxLines={1} color="#ffffff99">
              {c().subtitle}
            </text>
          </Show>
        </Show>
      </view>
      {/* The pointer's hit area and hover ring, the size of the focus ring; the title under it still
      takes the click through the card (Grid passes the click). */}
      <view width={bw()} height={bh()} pointerRing={c().image ? r() : undefined} onPointerClick={props.onPointerClick} />
    </view>
  )
}
