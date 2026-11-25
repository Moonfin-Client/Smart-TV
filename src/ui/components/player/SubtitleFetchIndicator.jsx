import $L from '../../../services/i18n.js'
import Ring from '../Ring.jsx'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { textWidth } from './look.js'

// The 22px label's normal line box. osdLayout.js keeps the same number.
const FETCH_H = 27

// A turning ring and "Fetching subtitles". It sits above the seek bar while the controls are up (PlayerOsd
// places it at x, y), and once they hide it moves to the corner on its own backing (`standalone`), since the
// wait can outlast them by minutes. `show` draws it.
// shortcut: the line box and gap are worked out, not measured on screen. Check them with a slow subtitle fetch.
export default function SubtitleFetchIndicator(props) {
  const label = $L('Fetching subtitles')
  const font = uiFont('bold')
  const pad = () => (props.standalone ? { x: 16, y: 6 } : { x: 0, y: 0 })
  const w = () => 18 + 10 + textWidth(label, 22, 'bold') + pad().x * 2
  const h = () => FETCH_H + pad().y * 2
  const ringY = () => pad().y + (FETCH_H - 18) / 2
  return (
    <view
      x={props.standalone ? 48 : props.x || 0}
      y={props.standalone ? 1080 - 40 - h() : props.y || 0}
      width={w()}
      height={h()}
      alpha={props.show ? 1 : 0}
      borderRadius={props.standalone ? 14 : 0}
      color={props.standalone ? '#0000008a' : '#00000000'}
    >
      <view x={pad().x} y={ringY()} width={18} height={18} borderRadius={9} border={{ width: 2, color: hex('#ffffff33') }} />
      <Ring x={pad().x} y={ringY()} size={18} thick={7} tint="#ffffffff" />
      <text x={pad().x + 28} y={pad().y} fontFamily={font} fontSize={22} lineHeight={FETCH_H} color="#ffffffb3">
        {label}
      </text>
    </view>
  )
}
