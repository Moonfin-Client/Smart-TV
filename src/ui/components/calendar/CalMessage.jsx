import { For } from 'solid-js'
import CalPill from './CalPill.jsx'
import Spinner from '../Spinner.jsx'

// The loading spinner, or the problem or empty message with its icon, centered in the area it's
// given, and Retry for a problem worth retrying. The view that holds it owns focus and passes
// retryFocused. The model `m` comes from messageModel.
export default function CalMessage(props) {
  const m = () => props.m
  return (
    <view x={m().x} y={m().y} width={m().w} height={m().h}>
      <Spinner x={m().w / 2 - 32} y={m().h / 2 - 32} size={64} alpha={m().loading ? 1 : 0} />
      <view alpha={m().loading ? 0 : 1}>
        <view x={m().w / 2 - 40} y={m().iconY} width={80} height={80} src={m().icon} color="#ffffff66" />
        <text
          fontFamily={m().font}
          fontSize={26.71}
          x={0}
          y={m().textY}
          maxWidth={m().w}
          contain="width"
          textAlign="center"
          lineHeight={m().lh}
          letterSpacing={m().ls}
          color="#ffffffcc"
        >
          {m().text}
        </text>
        <view>
          <For each={m().retry}>
            {(b) => (
              <CalPill
                x={b.x}
                y={b.y}
                p={b}
                focused={props.retryFocused}
                ring={props.ring}
                fill={props.fill}
                ink={props.ink}
                onPointerOver={props.onPointerRetry}
              />
            )}
          </For>
        </view>
      </view>
    </view>
  )
}
