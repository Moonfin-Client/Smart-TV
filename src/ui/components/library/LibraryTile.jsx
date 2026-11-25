import { Show } from 'solid-js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { textWidth } from './measure.js'
import { tx } from '../../fx.js'

// One card of a library grid. Grid owns focus and passes `focused`. Only the artwork rings, so a card
// without art grows but draws no ring. The page lays the cell out once in `opts`: cellW and cellH,
// padX and padY, the card's width and art height, and the text below it.
const CARD_TEXT_SHADOW = { color: '#0000008a', x: 0, y: 0, blur: 4 }
const BADGE_SHADOW = { color: shadowColor('#00000099'), x: 0, y: 1, blur: 4, spread: 0 }
const SERVER_SHADOW = { color: shadowColor('#00000080'), x: 0, y: 1, blur: 3, spread: 0 }
const WHITE_EDGE = { width: 1, color: hex('#ffffff') }
const RING = { width: 3, color: hex('#ffffff') }
const COVER = { resizeMode: { type: 'cover' } }
const CLEAR = '#00000000'

// A round badge with its drop shadow on a clear node under it, as the renderer draws no shadow
// under a node's own box.
export const Disc = (props) => (
  <view x={props.x} y={props.y} width={28} height={28}>
    <view width={28} height={28} borderRadius={14} color={CLEAR} shadow={BADGE_SHADOW} />
    <view width={28} height={28} borderRadius={14} color={props.fill} border={WHITE_EDGE} />
    <view x={6.5} y={6.5} width={15} height={15} src={props.icon} color={props.ink} />
  </view>
)

export default function LibraryTile(props) {
  const o = () => props.opts || {}
  const c = () => props.card || {}
  const ring = () => !!props.focused && !c().loading
  const ease = () => ({ duration: o().ms || 0, easing: 'ease' })
  const serverW = () => 9 + 18 + 4 + Math.ceil(textWidth(String(c().servers), 18, 'bold')) + 9
  return (
    <view width={o().cellW} height={o().cellH}>
      <view
        x={o().padX}
        y={o().padY}
        width={o().cardW}
        height={o().cardH}
        pivot={0.5}
        scale={ring() ? 1.05 : 1}
        transition={tx({ scale: ease() })}
      >
        <view>
          <Show when={o().glow}>
            <view width={o().cardW} height={o().posterH} borderRadius={8} color={CLEAR} shadow={o().glow} alpha={ring() && c().image ? 1 : 0} transition={tx({ alpha: ease() })} />
          </Show>
        </view>
        <view width={o().cardW} height={o().posterH} borderRadius={8} color={o().artBg} />
        <view>
          <Show when={c().image}>
            <view x={3} y={3} width={o().cardW - 6} height={o().posterH - 6} borderRadius={5} src={c().image} textureOptions={COVER} />
          </Show>
        </view>
        <view>
          {/* A page not read yet, which focus doesn't mark.
          shortcut: drawn flat, since a moving shimmer would redraw every frame while a page loads.
          Animate it if the flat box reads as broken on TVs. */}
          <Show when={c().loading}>
            <view x={3} y={3} width={o().cardW - 6} height={o().posterH - 6} borderRadius={8} color={o().loadingBg || '#ffffff12'} />
          </Show>
        </view>
        <view>
          <Show when={!c().image && !c().loading && c().icon}>
            <view
              x={(o().cardW - 60) / 2}
              y={(o().posterH - 60) / 2}
              width={60}
              height={60}
              src={'icons/' + c().icon + '.webp'}
              color={o().mutedIcon}
            />
          </Show>
        </view>
        <view
          width={o().cardW}
          height={o().posterH}
          borderRadius={8}
          color={CLEAR}
          border={o().ring || RING}
          alpha={ring() && c().image ? 1 : 0}
          transition={tx({ alpha: ease() })}
        />
        <view>
          <Show when={c().fav}>
            <Disc x={8} y={o().favY} fill="#f44336" icon="icons/lib_favorite.webp" ink="#ffffff" />
          </Show>
        </view>
        <view>
          <Show when={c().played}>
            <Disc x={o().cardW - 36} y={8} fill={o().watchedBg} icon="icons/lib_check.webp" ink={o().onBadge} />
          </Show>
        </view>
        <view>
          {/* How many servers hold a merged card's title. */}
          <Show when={c().servers > 1}>
            <view x={6} y={o().posterH - 38} width={serverW()} height={30}>
              <view width={serverW()} height={30} borderRadius={15} color={CLEAR} shadow={SERVER_SHADOW} />
              <view width={serverW()} height={30} borderRadius={15} color="#000000bf" border={{ width: 1.5, color: hex('#ffffff') }} />
              <view x={9} y={6} width={18} height={18} src="icons/dns.webp" color="#ffffff" />
              <text fontFamily={o().boldFont} fontSize={18} x={31} y={6} lineHeight={18} color="#ffffff">
                {String(c().servers)}
              </text>
            </view>
          </Show>
        </view>
        <view>
          <Show when={c().clip != null}>
            <view x={o().cardW - 10 - c().clipW} y={o().posterH - 38} width={c().clipW} height={28} borderRadius={14} color="#000000b8">
              <view x={6} y={5} width={18} height={18} src="icons/lib_play.webp" color="#ffffff" />
              <text fontFamily={o().boldFont} fontSize={17} x={26} y={5} color="#ffffff">
                {c().clip || ''}
              </text>
            </view>
          </Show>
        </view>
        <view>
          <Show when={o().showText && !c().loading && props.card}>
            <text
              fontFamily={c().titleFont}
              fontSize={o().tSize || 19}
              y={o().posterH + (o().tY || 4)}
              lineHeight={o().tLh || 22.8}
              maxWidth={o().cardW + 6}
              maxLines={1}
              color="#ffffff"
              textShadow={o().textShadow ? CARD_TEXT_SHADOW : undefined}
            >
              {c().title || ''}
            </text>
            <Show when={c().subtitle}>
              <text
                fontFamily={c().subtitleFont}
                fontSize={o().sSize || 17}
                y={o().posterH + (o().sY || 26.8)}
                lineHeight={o().sLh || 20.4}
                maxWidth={o().cardW + 6}
                maxLines={1}
                color={o().subColor || '#ffffff99'}
                textShadow={o().textShadow ? CARD_TEXT_SHADOW : undefined}
              >
                {c().subtitle}
              </text>
            </Show>
          </Show>
        </view>
      </view>
    </view>
  )
}
