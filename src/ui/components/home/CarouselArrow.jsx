import Frost from './Frost.jsx'

// A media bar's arrow. The bars keep Left and Right to themselves, so the arrows never take focus.
// Props: ax, ay, icon, frost (the blurred backdrop, or '' for none), ink and radius.
const BORDER = { width: 1, color: 0xffffff59 }

// The arrows halfway down a bar `h` tall, without the left one beside a sidebar.
export const arrowSpots = (count, h, left) => {
  if (count < 2) return []
  const y = Math.round(h / 2) - 35
  const list = [{ x: 1830, y, icon: 'chevron_right' }]
  if (!left) list.unshift({ x: 20, y, icon: 'chevron_left' })
  return list
}

export default function CarouselArrow(props) {
  return (
    <view x={props.ax} y={props.ay} width={70} height={70} pointerRing={props.radius} onPointerClick={props.onPointerClick}>
      <Frost img={props.frost} sx={props.ax} sy={props.ay} fw={70} fh={70} radius={props.radius} />
      <view width={70} height={70} borderRadius={props.radius} color="#ffffff0f" border={BORDER} />
      <view x={19} y={19} width={32} height={32} src={'icons/' + props.icon + '.webp'} color={props.ink} />
    </view>
  )
}
