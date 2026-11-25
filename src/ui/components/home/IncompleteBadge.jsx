import $L from '../../../services/i18n.js'
import { cssShift, textWidth, uiFont } from '../../text.js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'

// A card's badge for a Live TV recording that missed part of its program: an amber pill with a
// scissors glyph in the top left corner, under the favorite badge and any Seerr banner. The card
// places it with `x` and `y`.
const SHADOW = { color: shadowColor('#0000004d'), x: 0, y: 1.5, blur: 4, spread: 0 }
const EDGE = { width: 1.5, color: hex('#1e1e24ff') }

export default function IncompleteBadge(props) {
  const label = $L('Incomplete')
  // 26px tall inside a 1.5px border, padded 7 before the 15px glyph and 10 after the text.
  const w = 3 + 7 + 15 + 4 + textWidth(label, 14, 'bold') + 10
  return (
    <view x={props.x || 0} y={props.y || 0} width={w} height={29} borderRadius={13} color="#e0a33cff" border={EDGE} shadow={SHADOW}>
      <view x={8.5} y={7} width={15} height={15} src="icons/home_incomplete.webp" color="#1e1e24ff" />
      <text x={27.5} y={1.5 + cssShift(14)} fontFamily={uiFont('bold')} fontSize={14} lineHeight={26} color="#1e1e24ff">
        {label}
      </text>
    </view>
  )
}
