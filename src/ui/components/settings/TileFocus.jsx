import { For } from 'solid-js'
import { hex } from '../../color.js'
import { fx } from './fx.js'

// The look a settings tile takes on focus: the focused button fill, the accent edge and the theme's
// glow, fading in over [fade] ms. The glows sit on clear nodes under the fill, since the shader
// draws no shadow under a node's own box. [glow] false leaves them off.
export default function TileFocus(props) {
  const on = () => (props.on ? 1 : 0)
  return (
    <view width={props.w} height={props.h}>
      <view>
        <For each={props.glow === false ? [] : props.p.tileGlow}>
          {(g) => (
            <view
              transition={fx('alpha', props.fade || 0)}
              width={props.w}
              height={props.h}
              borderRadius={props.radius}
              color="#00000000"
              shadow={g.shadow}
              alpha={on()}
            />
          )}
        </For>
      </view>
      <view
        transition={fx('alpha', props.fade || 0)}
        width={props.w}
        height={props.h}
        borderRadius={props.radius}
        color={props.fill || props.p.tileFocusFill}
        border={props.edge === 0 ? undefined : { width: props.edge || 1, color: hex(props.edgeColor || props.p.tileFocusBorder) }}
        alpha={on()}
      />
    </view>
  )
}
