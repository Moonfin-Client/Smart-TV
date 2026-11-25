import { createEffect, createSignal, on } from 'solid-js'
import { cssShift } from '../../text.js'
import { hex } from '../../color.js'
import { CARD_W, ellipsize } from './carouselModels.js'
import { barMask } from './canvasArt.js'

// Text sits on CSS line boxes (1.17 on the number, name and metadata, 27px on the title) moved by
// cssShift. The 61px header row centers its items, and the title starts at 88.5.
const TITLE_Y = 88.5
const ACCENT_EDGE = { width: 3, color: hex('#00a4dcff') }

// One channel in the live TV channel carousel: the genre bar, the number, name, marks and logo over
// the program title, its metadata line and its progress. The centered card has a 3px accent border
// where the others have a clear 1px one, so its content sits 2px further in. Props: `x`, `m` (a
// model from carouselModels.cardModel) and `centered`.
export default function CarouselCard(props) {
  const [lw, setLw] = createSignal(90)
  const [lh, setLh] = createSignal(61)
  const [logoFailed, setLogoFailed] = createSignal(false)
  const barOff = barMask(13.5, 216.95)
  const barOn = barMask(11.5, 212.95)
  const bw = () => (props.centered ? 3 : 1)
  const cw = () => CARD_W - 2 * bw() - 39
  const hasLogo = () => !!props.m.logo && !logoFailed()
  const nameW = () => Math.max(0, cw() - props.m.nameLess - (hasLogo() ? 102 : 0))
  const nameText = () => ellipsize(props.m.name, 23, 'bold', nameW())
  const markX = () => 23 + cw() - (hasLogo() ? 102 : 0) - 25.5
  const metaY = () => {
    const m = props.m
    const lines = props.centered ? m.linesOn : m.linesOff
    return TITLE_Y + (m.title ? lines * 27 : m.loading ? 34.5 : 0) + cssShift(20)
  }
  createEffect(
    on(
      () => (props.m ? props.m.logo : ''),
      () => setLogoFailed(false),
      { defer: true },
    ),
  )
  // A wordmark or a square icon fits whole in its 90x61 box, held against the trailing edge.
  const onLogo = (dim) => {
    if (!dim || !dim.w || !dim.h) return
    const scale = Math.min(90 / dim.w, 61 / dim.h)
    setLw(dim.w * scale)
    setLh(dim.h * scale)
  }
  return (
    <view x={props.x} width={440.8} height={218.95}>
      <view width={440.8} height={218.95} borderRadius={14.5} color={props.centered ? props.m.bgOn : props.m.bgOff} />
      <view x={1} y={1} width={6} height={216.95} src={barOff} color={props.m.bar} alpha={props.centered ? 0 : 1} />
      <view x={3} y={3} width={6} height={212.95} src={barOn} color={props.m.bar} alpha={props.centered ? 1 : 0} />
      <view x={bw()} y={bw()}>
        <view alpha={props.m.fav ? 1 : 0} x={23} y={33.75} width={25.5} height={25.5} src="icons/favorite.webp" color="#f44336ff" />
        <text
          alpha={props.m.number ? 1 : 0}
          fontFamily={props.m.numFont}
          fontSize={32}
          lineHeight={37.44}
          x={23 + props.m.numX}
          y={30.78}
          color="#ffffffff"
        >
          {props.m.number || ' '}
        </text>
        <text fontFamily={props.m.nameFont} fontSize={23} lineHeight={26.91} x={23 + props.m.nameX} y={35.045} color="#ffffffff">
          {nameText() || ' '}
        </text>
        <view alpha={props.m.mark ? 1 : 0} x={markX() + 4} y={33.75} width={25.5} height={25.5} src={props.m.mark} color={props.m.markColor} />
        <view
          alpha={hasLogo() ? 1 : 0}
          x={23 + cw() - lw()}
          y={16 + (61 - lh()) / 2}
          width={lw()}
          height={lh()}
          src={props.m.logo}
          onEvent={{
            loaded: (_, e) => onLogo(e && e.dimensions),
            failed: () => setLogoFailed(true),
          }}
        />
        <text
          alpha={props.m.title ? 1 : 0}
          fontFamily={props.m.titleFont}
          fontSize={23}
          lineHeight={27}
          x={23}
          y={90.5}
          maxWidth={cw()}
          maxLines={2}
          color="#ffffffff"
        >
          {props.m.title || ' '}
        </text>
        <view alpha={props.m.loading ? 1 : 0} x={23} y={88.5} width={cw()} height={14.5} borderRadius={4.5} color="#ffffff1f" />
        <view alpha={props.m.loading ? 1 : 0} x={23} y={111.5} width={cw() / 2} height={11.5} borderRadius={4.5} color="#ffffff1f" />
        <text alpha={props.m.meta ? 1 : 0} fontFamily={props.m.metaFont} fontSize={20} lineHeight={23.4} x={23} y={metaY()} maxWidth={cw()} maxLines={1} color="#ffffff99">
          {props.m.meta || ' '}
        </text>
        <view alpha={props.m.live ? 1 : 0} x={17.5} y={201.45 - 2 * bw()} width={411.8 - 2 * bw()} height={6} borderRadius={3} color="#404040ff">
          <view width={(411.8 - 2 * bw()) * props.m.progress} height={6} borderRadius={3} color="#00a4dcff" />
        </view>
      </view>
      <view width={440.8} height={218.95} borderRadius={14.5} color="#00000000" border={ACCENT_EDGE} alpha={props.centered ? 1 : 0} />
    </view>
  )
}
