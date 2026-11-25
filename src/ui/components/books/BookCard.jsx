import { For, Show } from 'solid-js'
import { hex } from '../../color.js'
import { glowShadow } from '../../theme.js'

// Purely visual. Whatever lays the cards out owns focus and passes `focused`.
const CLEAR = '#00000000'
const COVER = { resizeMode: { type: 'cover' } }

export default function BookCard(props) {
  const c = () => props.card
  const look = () => props.look
  const radius = () => look().radius
  const glows = () => (look().glow || []).map((g, i) => glowShadow(g, i))
  const textAlpha = () => (c().finished ? 0.6 : 1)
  const phSize = () => Math.min(c().w - 8, c().h - 8) * 0.4
  const checkSize = () => (c().w - 8) * 0.3
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={c().w}
      height={c().h + 78}
      pivot={0.5}
      transition={{ scale: { duration: 150, easing: 'ease-out' } }}
      scale={props.focused && props.zoom !== false ? 1.05 : 1}
      onPointerOver={props.onPointerOver}
      onPointerClick={props.onPointerClick}
      pointerRing={props.pointerRing}
    >
      <view>
        <Show when={props.focused}>
          <For each={glows()}>{(g) => <view width={c().w} height={c().h} borderRadius={radius()} color={CLEAR} shadow={g.shadow} />}</For>
        </Show>
      </view>
      <view width={c().w} height={c().h} borderRadius={radius()} color={look().os08} />
      {/* The cover's parts are all conditional, so they share one container to keep their draw order. */}
      <view>
        <Show when={c().image}>
          <view x={4} y={4} width={c().w - 8} height={c().h - 8} borderRadius={Math.max(0, radius() - 4)} src={c().image} textureOptions={COVER} />
        </Show>
        <Show when={!c().image}>
          <view
            x={(c().w - phSize()) / 2}
            y={(c().h - phSize()) / 2}
            width={phSize()}
            height={phSize()}
            src={'icons/' + c().placeholder + '.webp'}
            color={look().os35}
          />
        </Show>
        <Show when={c().number}>
          <view x={14} y={14} width={c().numberW} height={39} borderRadius={17} color={look().accent}>
            <text fontFamily={c().badgeFont} fontSize={18} x={c().numberW / 2} mountX={0.5} y={9} color={look().onAccent}>
              {c().number}
            </text>
          </view>
        </Show>
        <Show when={c().upNext}>
          <view x={c().w - 14 - c().upNextW} y={14} width={c().upNextW} height={39} borderRadius={8} color="#ffffff">
            <text fontFamily={c().badgeFont} fontSize={15} letterSpacing={1} x={10} y={11} color="#101010">
              {c().upNext}
            </text>
          </view>
        </Show>
        <Show when={c().finished}>
          <view x={4} y={4} width={c().w - 8} height={c().h - 8} borderRadius={Math.max(0, radius() - 4)} color="#00000073">
            <view
              x={(c().w - 8 - checkSize()) / 2}
              y={(c().h - 8 - checkSize()) / 2}
              width={checkSize()}
              height={checkSize()}
              src="icons/book_check_rounded.webp"
            />
          </view>
        </Show>
        <Show when={c().format}>
          <view x={14} y={14} width={30} height={30} borderRadius={7} color="#000000b8">
            <view x={5} y={5} width={20} height={20} src={'icons/' + c().format + '.webp'} />
          </view>
        </Show>
        <Show when={c().time}>
          <view x={c().w - 14 - c().timeW} y={c().h - 53} width={c().timeW} height={39} borderRadius={7} color="#000000c7">
            <text fontFamily={c().badgeFont} fontSize={17} x={8} y={10} color="#ffffff">
              {c().time}
            </text>
          </view>
        </Show>
        <Show when={c().progress > 0}>
          <view x={10} y={c().h - 22} width={c().w - 20} height={12} borderRadius={6} color="#0000008a">
            <view width={(c().w - 20) * c().progress} height={12} borderRadius={6} color={look().accent} />
          </view>
        </Show>
        <Show when={props.focused}>
          <view width={c().w} height={c().h} borderRadius={radius()} color={CLEAR} border={{ width: 4, color: hex(look().focus) }} />
        </Show>
      </view>
      <text fontFamily={c().titleFont} fontSize={20} y={c().h + 15} color={props.focused ? look().onSurface : look().os90} alpha={textAlpha()}>
        {c().title}
      </text>
      <text fontFamily={c().subtitleFont} fontSize={16} y={c().h + 52} color={look().os60} alpha={textAlpha()}>
        {c().subtitle}
      </text>
    </view>
  )
}
