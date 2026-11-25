import { Show } from 'solid-js'
import { fontFor, faceDy, themeSpacing } from '../../text.js'
import { theme } from '../../theme.js'
import { hex } from '../../color.js'
import { getStore } from '../../../state/store.js'
import { navUser } from './navKit.js'

// The avatar the top bars share: a 64px face or initial at the User Opacity setting, ringed in the
// focus color when focused. x and y place the 72px ring.
export default function NavAvatar(props) {
  const { avatar, initial } = navUser(getStore())
  return (
    <view ref={props.ref} x={props.x} y={props.y} width={72} height={72}>
      <view
        width={72}
        height={72}
        borderRadius={36}
        color="#00000000"
        border={{ width: 4, color: hex(theme().focus) }}
        alpha={props.focused ? 1 : 0}
      />
      {/* A 135 degree gradient runs corner to corner on a square, so the other two corners take the midpoint color. */}
      <view
        x={4}
        y={4}
        width={64}
        height={64}
        borderRadius={32}
        colorTl={0x00a4dcff}
        colorTr={0x008ec9ff}
        colorBl={0x008ec9ff}
        colorBr={0x0077b6ff}
        alpha={avatar() ? 0 : props.opacity}
      >
        <text
          letterSpacing={themeSpacing()}
          fontFamily={fontFor(initial(), 'bold')}
          fontSize={30}
          x={32}
          y={20 + faceDy(30)}
          mountX={0.5}
          lineHeight={30}
          color="#ffffffff"
        >
          {initial()}
        </text>
      </view>
      <view>
        <Show when={avatar()}>
          <view
            x={4}
            y={4}
            width={64}
            height={64}
            borderRadius={32}
            src={avatar()}
            textureOptions={{ resizeMode: { type: 'cover' } }}
            alpha={props.opacity}
          />
        </Show>
      </view>
    </view>
  )
}
