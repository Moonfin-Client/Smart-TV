import { For, createSignal } from 'solid-js'
import { theme, shadowColor } from '../../theme.js'

// The page builds the tile model (gameModels.systemTile), so this only draws it. Props: `tile`,
// `focused`, `x`, `y`.
const TILE_W = 425.5
const TILE_H = 183

const COVER = { resizeMode: { type: 'cover' } }
// Neon Pulse adds a pink glow outside its ring.
const NEON_GLOW = { color: shadowColor('#ff2e9266'), x: 0, y: 0, blur: 14, spread: 0 }
const NAME_SHADOW = { color: '#000000ff', x: 0, y: 0, blur: 5 }
const COUNT_SHADOW = { color: '#000000ff', x: 0, y: 0, blur: 4 }

function Cover(props) {
  const [failed, setFailed] = createSignal(false)
  const c = () => props.cell
  return (
    <view x={1 + c().x} y={1} width={c().w} height={181} borderRadius={c().r} color={c().color}>
      <view
        width={c().w}
        height={181}
        borderRadius={c().r}
        src={c().image}
        textureOptions={COVER}
        alpha={failed() ? 0 : 1}
        onEvent={{ failed: () => setFailed(true) }}
      />
    </view>
  )
}

export default function GameSystemCard(props) {
  // Neon Pulse rings a focused tile and sets the names in the default blue, not the theme's accent.
  const neon = () => theme().id === 'neon_pulse'
  const t = () => props.tile
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={TILE_W}
      height={TILE_H}
      pivot={0.5}
      scale={props.focused ? 1.05 : 1}
      transition={{ scale: { duration: 150, easing: 'ease' } }}
    >
      <view x={-4} y={-4} width={433.5} height={191} borderRadius={16} color="#00000000" shadow={NEON_GLOW} alpha={props.focused && neon() ? 1 : 0} />
      <view x={-4} y={-4} width={433.5} height={191} borderRadius={16} color={neon() ? '#00a4dc' : '#ffffff'} alpha={props.focused ? 1 : 0} />
      <view width={TILE_W} height={TILE_H} borderRadius={12} color="#ffffff14" />
      <view x={1} y={1} width={423.5} height={181} borderRadius={11} color={t().bg} />
      <view>
        <For each={t().cells}>{(c) => <Cover cell={c} />}</For>
      </view>
      <view x={1} y={1} width={423.5} height={181} src="images/game_tile_scrim.webp" />
      <view x={27} y={58} width={67} height={67} borderRadius={17} color="#00000057">
        <view x={13} y={13} width={41} height={41} src="icons/game_system.webp" />
      </view>
      <text
        x={114}
        y={t().nameY}
        fontFamily={t().nameFont}
        fontSize={26}
        lineHeight={31.2}
        maxWidth={249.5}
        maxLines={2}
        textShadow={NAME_SHADOW}
        color={neon() ? '#00a4dc' : '#ffffff'}
      >
        {t().name}
      </text>
      <text
        x={114}
        y={t().countY}
        fontFamily={t().countFont}
        fontSize={19}
        lineHeight={33}
        maxWidth={249.5}
        maxLines={1}
        textShadow={COUNT_SHADOW}
        color="#ffffffc2"
      >
        {t().count}
      </text>
      <view x={363.5} y={74} width={35} height={35} src="icons/game_chevron.webp" color="#ffffffb8" />
    </view>
  )
}
