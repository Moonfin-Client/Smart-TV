import { hex } from '../../color.js'
import { fx } from './fx.js'

// The settings switch, 86.8 by 53.4 at x, y: the track fills with the accent and the thumb grows
// and slides right as it turns on, over [slide] ms. Rows, friends cards and the Settings Sync card
// share it. [p] is the settings palette.
export default function SettingsSwitch(props) {
  const on = () => !!props.on
  return (
    <view x={props.x} y={props.y} width={86.8} height={53.4}>
      <view width={86.8} height={53.4} borderRadius={26.71} color={props.p.trackOff} border={{ width: 3, color: hex(props.p.trackOffBorder) }} />
      <view
        transition={fx('alpha', props.slide || 0)}
        width={86.8}
        height={53.4}
        borderRadius={26.71}
        color={props.p.accent}
        border={{ width: 3, color: hex(props.p.accent) }}
        alpha={on() ? 1 : 0}
      />
      <view
        transition={fx('x,y,width,height', props.slide || 0)}
        x={on() ? 39.73 : 13.02}
        y={on() ? 6.68 : 13.36}
        width={on() ? 40.07 : 26.71}
        height={on() ? 40.07 : 26.71}
        borderRadius={on() ? 20.03 : 13.36}
        color={on() ? props.p.thumbOn : props.p.thumbOff}
      />
    </view>
  )
}
