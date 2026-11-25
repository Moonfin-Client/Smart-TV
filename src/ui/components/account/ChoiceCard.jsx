import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { motion, spacingFor, themeDy } from './look.js'

// One way to add a server in the Add Server panel. It's visual only, the page owns focus.
const TILES = {
  accent: { bg: '#00a4dc24', fg: '#00a4dc', icon: 'acc_language', size: 40.07 },
  plex: { bg: '#e5a00d24', fg: '#f2bc45', icon: 'acc_plex', size: 36.73 },
  emby: { bg: '#52b54b24', fg: '#7bd175', icon: 'acc_emby', size: 40.07 },
}
const NONE = '#00000000'

export default function ChoiceCard(props) {
  const t = TILES[props.tile] || TILES.accent
  const dur = motion ? 160 : 0
  const on = () => !!props.focused
  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      onPointerOver={props.onPointerOver}
      width={789.4}
      height={125.5}
      pivot={0.5}
      scale={on() ? 1.02 : 1}
      transition={{ scale: { duration: dur } }}
    >
      <view
        x={-5.009}
        y={-5.009}
        width={799.42}
        height={135.52}
        borderRadius={35.06}
        color={NONE}
        border={{ width: 5.009, color: hex('#00a4dc59') }}
        alpha={on() ? 1 : 0}
        transition={{ alpha: { duration: dur } }}
      />
      <view width={789.4} height={125.5} borderRadius={30.05} color={on() ? '#00a4dc1f' : '#ffffff09'} />
      <view
        width={789.4}
        height={125.5}
        borderRadius={30.05}
        color={NONE}
        border={{ width: 1, color: hex(on() ? '#00a4dc' : '#ffffff12') }}
      />
      <view x={22.7} y={22.7} width={80.14} height={80.14} borderRadius={23.37} color={t.bg}>
        <view x={(80.14 - t.size) / 2} y={(80.14 - t.size) / 2} width={t.size} height={t.size} src={`icons/${t.icon}.webp`} color={t.fg} />
      </view>
      <text
        fontFamily={uiFont('bold')}
        fontSize={26.713}
        lineHeight={33}
        x={126.2}
        y={31.55 + themeDy(26.713, uiFont('bold'))}
        color="#fffffff2"
        letterSpacing={spacingFor(uiFont('bold'))}
      >
        {props.title || ' '}
      </text>
      <text
        fontFamily={uiFont()}
        fontSize={21.704}
        lineHeight={29.3}
        x={126.2}
        y={69.09 + themeDy(21.704, uiFont())}
        color="#ffffff99"
        letterSpacing={spacingFor(uiFont())}
      >
        {props.detail || ' '}
      </text>
      <view x={713.3} y={36.03} width={53.43} height={53.43} borderRadius={26.71} color={on() ? '#00a4dc' : '#ffffff0f'}>
        <view x={13.36} y={13.36} width={26.71} height={26.71} src="icons/acc_arrowForward.webp" color={on() ? '#04151c' : '#ffffff99'} />
      </view>
    </view>
  )
}
