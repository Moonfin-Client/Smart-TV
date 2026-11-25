import { fontFor } from '../../text.js'
import { hex } from '../../color.js'
import { motion, spacingFor, themeDy } from './look.js'

// A server in the sign-in lists: its brand mark, name and address. It's visual only, the page
// passes `focused`. `serverType` picks the mark: jellyfin, emby, plex or silo.
const NONE = '#00000000'
const RING = hex('#00a4dc')

export default function ServerTile(props) {
  const w = () => props.w || 1059.9
  const mark = () => {
    const t = props.serverType
    return `icons/acc_${t === 'emby' || t === 'plex' || t === 'silo' ? t : 'jellyfin'}.webp`
  }
  const dur = motion ? 120 : 0
  return (
    <view x={props.x || 0} y={props.y || 0} onPointerOver={props.onPointerOver} width={w()} height={112.12}>
      <view width={w()} height={112.12} borderRadius={20.03} color={props.focused ? '#00a4dc2e' : '#ffffff0d'} />
      <view
        width={w()}
        height={112.12}
        borderRadius={20.03}
        color={NONE}
        border={{ width: 3, color: RING }}
        alpha={props.focused ? 1 : 0}
        transition={{ alpha: { duration: dur } }}
      />
      <view x={29.71} y={36.02} width={40.07} height={40.07} src={mark()} color="#ffffffb3" />
      <text
        fontFamily={fontFor(props.name || '', 'bold')}
        fontSize={23.374}
        lineHeight={33}
        x={89.81}
        y={25.18 + themeDy(23.374, fontFor(props.name || '', 'bold'))}
        maxWidth={w() - 119.52}
        maxLines={1}
        color="#ffffffe6"
        letterSpacing={spacingFor(fontFor(props.name || '', 'bold'))}
      >
        {props.name || ' '}
      </text>
      <text
        fontFamily={fontFor(props.detail || '')}
        fontSize={21.704}
        lineHeight={33}
        x={89.81}
        y={58.02 + themeDy(21.704, fontFor(props.detail || ''))}
        maxWidth={w() - 119.52}
        maxLines={1}
        color="#ffffff80"
        letterSpacing={spacingFor(fontFor(props.detail || ''))}
      >
        {props.detail || ' '}
      </text>
    </view>
  )
}
