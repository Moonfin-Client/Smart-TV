import $L from '../../../services/i18n.js'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { motion, spacingFor, themeDy } from './look.js'

// The Add Server button under the server list. It's visual only, the page owns focus.
const NONE = '#00000000'
const TILE_SHADOW = { color: shadowColor('#00a4dc59'), x: 0, y: 10.02, blur: 26.71, spread: 0 }
const MARKS = ['jellyfin', 'emby', 'plex', 'silo']

export default function AddServerButton(props) {
  const dur = motion ? 160 : 0
  return (
    <view x={props.x || 0} y={props.y || 0} onPointerOver={props.onPointerOver} width={1059.9} height={105.5} alpha={props.disabled ? 0.5 : 1}>
      <view width={1059.9} height={105.5} borderRadius={26.71} color={props.focused ? '#00a4dc2e' : '#00a4dc1a'} />
      <view
        width={1059.9}
        height={105.5}
        borderRadius={26.71}
        color={NONE}
        border={{ width: 1, color: hex(props.focused ? '#00a4dcd9' : '#00a4dc73') }}
      />
      <view
        x={-1}
        y={-1}
        width={1061.9}
        height={107.5}
        borderRadius={26.71}
        color={NONE}
        border={{ width: 3, color: hex('#ffffffe6') }}
        alpha={props.focused ? 1 : 0}
        transition={{ alpha: { duration: dur } }}
      />
      <view x={19.36} y={19.36} width={66.78} height={66.78} borderRadius={20.03} color={NONE} shadow={TILE_SHADOW} />
      <view x={19.36} y={19.36} width={66.78} height={66.78} borderRadius={20.03} color="#00a4dc">
        <view x={13.36} y={13.36} width={40.07} height={40.07} src="icons/acc_addRounded.webp" color="#04151c" />
      </view>
      <text
        fontFamily={uiFont('bold')}
        fontSize={25.044}
        lineHeight={29.35}
        x={109.5}
        y={24.8 + themeDy(25.044, uiFont('bold'))}
        color="#fffffff2"
        letterSpacing={spacingFor(uiFont('bold'))}
      >
        {$L('Add Server')}
      </text>
      <text
        fontFamily={uiFont()}
        fontSize={21.704}
        lineHeight={28.2}
        x={109.5}
        y={56.79 + themeDy(21.704, uiFont())}
        maxWidth={750.8}
        maxLines={1}
        color="#ffffff99"
        letterSpacing={spacingFor(uiFont())}
      >
        {$L('By address, or with a Plex or Emby Connect account')}
      </text>
      {MARKS.map((m, i) => (
        <view x={876.9 + i * 43.4} y={39.4} width={26.71} height={26.71} src={`icons/acc_${m}.webp`} color="#ffffff80" />
      ))}
    </view>
  )
}
