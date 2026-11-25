import { For, Index, Show } from 'solid-js'
import { highMs } from '../../tier.js'
import { hex } from '../../color.js'
import { theme } from '../../theme.js'
import LoopMarquee from '../home/LoopMarquee.jsx'
import { tx } from '../../fx.js'

// One tile of the requests grid: a whole 2:3 poster with its type badge, the status band at its
// foot and the round action buttons over it, then a caption of one height. Purely visual.
// `focusAt` is the index of the focused tile and `subAt` the action button that has focus there
// (1 for the first), which takes the ring from the tile.
// tile: a RequestsModels.requestTile model. The numbers are RequestsModels.GRID's: a 262 wide
// tile, its 246 by 369 poster 8 in, and the caption from 389.
const COVER = { resizeMode: { type: 'cover' } }

export default function RequestsTile(props) {
  const t = () => props.tile
  const focused = () => !!t() && t().idx === props.focusAt
  const sub = () => (focused() ? props.subAt || 0 : 0)
  const on = () => focused() && !sub()
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={262}
      height={t().h}
      pivot={0.5}
      transition={tx({ scale: { duration: highMs(150), easing: 'ease' } })}
      scale={on() ? 1.02 : 1}
    >
      <view width={262} height={t().h} borderRadius={12} color="#ffffff14" alpha={on() ? 1 : 0} />
      <view x={8} y={8} width={246} height={369} borderRadius={8} color="#ffffff0f" />
      <view>
        <Show when={t().image}>
          <view x={8} y={8} width={246} height={369} borderRadius={8} src={t().image} textureOptions={COVER} />
        </Show>
      </view>
      <view x={18} y={18} width={t().badgeW} height={26} borderRadius={4} color={t().badgeColor}>
        <text x={9} y={4.5} fontFamily={t().badgeFont} fontSize={15} letterSpacing={0.8} lineHeight={19.5} color="#ffffffff">
          {t().badge}
        </text>
      </view>
      <view x={8} y={370} width={246} height={7} borderRadius={[0, 0, 8, 8]} color={t().stripe} />
      <view x={4} y={4} width={254} height={377} borderRadius={12} color="#00000000" border={{ width: 4, color: hex(theme().focus) }} alpha={on() ? 1 : 0} />
      <view>
        <Index each={t().actions}>
          {(b, i) => {
            const bOn = () => sub() === i + 1
            return (
              <view
                x={b().x}
                y={301}
                width={56}
                height={56}
                pivot={0.5}
                transition={{ scale: { duration: 120, easing: 'ease' } }}
                scale={bOn() ? 1.05 : 1}
              >
                <view width={56} height={56} borderRadius={28} color="#000000b3" />
                <view width={56} height={56} borderRadius={28} color="#00000000" border={{ width: 3, color: hex(b().color) }} alpha={bOn() ? 1 : 0} />
                <view x={11} y={11} width={34} height={34} src={'icons/' + b().icon + '.webp'} color={b().color} />
              </view>
            )
          }}
        </Index>
      </view>
      <LoopMarquee x={14} y={389} text={t().title} font={t().titleFont} weight="bold" size={20} lh={28} ink="#ffffffff" width={234} active={focused()} />
      <view>
        <Show when={t().status === 'chip'}>
          <view x={14} y={421.5} width={t().chip.w} height={43} borderRadius={6} color={t().chip.fill} border={{ width: 1, color: hex(t().chip.border) }}>
            <text x={13} y={6.5} fontFamily={t().chip.font} fontSize={18} letterSpacing={0.4} lineHeight={33} color={t().chip.ink}>
              {t().chip.text}
            </text>
          </view>
        </Show>
        <Show when={t().status === 'bar' && t().bar}>
          {(b) => (
            <view x={14} y={420.5}>
              <text y={1.5} fontFamily={b().font} fontSize={b().size} lineHeight={33} maxWidth={b().leadW} maxLines={1} color="#ffffffb3">
                {b().lead}
              </text>
              <text x={b().sepX} y={1.5} fontFamily={b().font} fontSize={b().size} lineHeight={33} color="#ffffffb3">
                {b().sep}
              </text>
              <text x={b().pctX} y={1.5} fontFamily={b().font} fontSize={b().size} lineHeight={33} color="#ffffffb3">
                {b().pct}
              </text>
              <view y={b().trackY} width={234} height={b().trackH} borderRadius={b().trackH / 2} color="#505050d9" />
              <view y={b().trackY} width={b().fillW} height={b().trackH} borderRadius={b().trackH / 2} color={b().fill} alpha={b().fillAlpha} />
            </view>
          )}
        </Show>
        <Show when={t().status === 'notfound'}>
          <view x={14} y={426.5}>
            <view y={7.15} width={18.7} height={18.7} src="icons/search_off.webp" color="#ffffff99" />
            <text x={24.7} y={1.5} fontFamily={t().notFoundFont} fontSize={17} lineHeight={33} maxWidth={209} maxLines={1} color="#ffffff99">
              {t().notFoundLabel}
            </text>
          </view>
        </Show>
      </view>
      <view>
        <For each={t().lines}>
          {(ln) => (
            <text x={14} y={ln.y + 1.5} fontFamily={ln.font} fontSize={16} lineHeight={22} maxWidth={234} maxLines={ln.maxlines} color={ln.color}>
              {ln.text}
            </text>
          )}
        </For>
      </view>
    </view>
  )
}
