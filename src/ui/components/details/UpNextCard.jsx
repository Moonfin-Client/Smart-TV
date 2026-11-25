import { createSignal } from 'solid-js'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'

// Modern's Next Up card: a 594px glass panel beside the action row with the episode's
// code and name in the accent, three lines of its overview, its progress and time left, and its
// still with a play glyph. Focus widens the border to 4px in the focus color.
//
// Props: `card` (laid out by the page: label, overview, remaining, progress, thumb, h), `tokens`,
// `x`, `y`, `alpha`. Enter calls onUpNextSelect(). Left and Up go on to the page.
const NO_CARD = { h: 0, label: '', overview: '', remaining: '', progress: 0, thumb: '', overviewY: 63, footY: 0, barW: 0, remainingX: 0 }
const EDGE = hex('#ffffff1f')

export default function UpNextCard(props) {
  const c = () => props.card || NO_CARD
  const t = () => props.tokens || { accent: '#0a84ffff', focus: '#00a4dcff', surfaceA: () => '#0e1117d1' }
  const bodyH = () => c().h - 64
  // Pixel themes square off every fixed radius.
  const r = () => (t().isPixel ? 0 : 17)
  const corner = () => (t().isPixel ? 0 : [0, 0, 16, 0])
  const [focused, setFocused] = createSignal(false)
  return (
    <view
      ref={props.ref}
      x={props.x || 0}
      y={props.y || 0}
      width={594}
      height={c().h}
      alpha={props.alpha == null ? 1 : props.alpha}
      onFocusChanged={setFocused}
      onEnter={() => {
        if (props.onUpNextSelect) props.onUpNextSelect()
        return true
      }}
    >
      <view width={594} height={c().h} borderRadius={r()} color={t().surfaceA(0.82)} />
      <view width={594} height={c().h * 0.35} borderRadius={r()} colorTop="#ffffff14" colorBottom="#ffffff00" />
      <view x={375} y={63} width={218} height={bodyH()} borderRadius={corner()} color="#1a1d22ff" />
      <view
        alpha={c().thumb ? 1 : 0}
        x={375}
        y={63}
        width={218}
        height={bodyH()}
        borderRadius={corner()}
        src={c().thumb || undefined}
        textureOptions={{ resizeMode: { type: 'cover' } }}
      />
      <view x={455} y={63 + (bodyH() - 58) / 2} width={58} height={58} src="icons/d/play.webp" color="#fffffff2" />
      <Ring focused={focused()} tokens={t()} h={c().h} r={r()} />
      <text
        x={24}
        y={19.5}
        fontFamily={uiFont('bold')}
        fontSize={17}
        lineHeight={33}
        letterSpacing={0.6}
        maxWidth={546}
        maxLines={1}
        color={t().accent}
      >
        {c().label}
      </text>
      <text
        x={24}
        y={c().overviewY + 1.5}
        fontFamily={c().overviewFont || uiFont('regular')}
        fontSize={17}
        lineHeight={22.95}
        maxWidth={328}
        maxLines={3}
        color="#ffffffb3"
      >
        {c().overview}
      </text>
      <view alpha={c().progress > 0 ? 1 : 0} x={24} y={c().footY + 13.5} width={c().barW} height={6} borderRadius={3} color="#ffffff33">
        <view height={6} borderRadius={3} width={c().barW * c().progress} color={t().accent} />
      </view>
      <text x={c().remainingX} y={c().footY + 1.5} fontFamily={uiFont('regular')} fontSize={16} lineHeight={33} color="#ffffffb3">
        {c().remaining}
      </text>
    </view>
  )
}

const Ring = (props) => (
  <>
    <view width={594} height={props.h} borderRadius={props.r} color="#00000001" border={{ width: 1, color: EDGE }} alpha={props.focused ? 0 : 1} />
    <view width={594} height={props.h} borderRadius={props.r} color="#00000001" border={{ width: 4, color: hex(props.tokens.focus) }} alpha={props.focused ? 1 : 0} />
  </>
)
