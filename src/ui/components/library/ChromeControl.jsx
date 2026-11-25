import { Show } from 'solid-js'
import { tx } from '../../fx.js'

// One control of the library header: a toolbar button, a bar pill, a docked row, the search
// field, a letter or a breadcrumb. The page works out every position and color in the model
// (see libraryChrome.js), so this only draws it, with the focus fill and ring faded in on focus.
// The ring's border is { w, color } with the color as the renderer's number (colorNum).
const CLEAR = '#00000000'
const src = (name) => 'icons/' + name + '.webp'

export default function ChromeControl(props) {
  const c = () => props.c
  const on = () => !!props.focused
  const fade = () => ({ duration: c().ms || 0 })
  return (
    <view
      x={c().x}
      y={c().y}
      width={c().w}
      height={c().h}
      pivot={0.5}
      scale={on() && c().zoom ? c().zoom : 1}
      transition={tx({ scale: fade() })}
    >
      <view>
        <Show when={c().base}>
          <view width={c().w} height={c().h} borderRadius={c().r} color={c().base} />
        </Show>
      </view>
      <view>
        <Show when={c().fill}>
          <view width={c().w} height={c().h} borderRadius={c().r} color={c().fill} alpha={on() ? 1 : 0} transition={tx({ alpha: fade() })} />
        </Show>
      </view>
      <view>
        <Show when={c().ring}>
          <view
            width={c().w}
            height={c().h}
            borderRadius={c().r}
            color={CLEAR}
            border={{ width: c().ringBorder.w, color: c().ringBorder.color }}
            alpha={on() ? 1 : 0}
            transition={tx({ alpha: fade() })}
          />
        </Show>
      </view>
      <view>
        <Show when={c().icon}>
          <view
            x={c().ix}
            y={c().iy}
            width={c().isz}
            height={c().isz}
            src={src(c().icon)}
            color={on() ? c().inkOn : c().iconOff}
            alpha={c().iconAlpha}
          />
        </Show>
      </view>
      <view>
        <Show when={c().label}>
          <text
            fontFamily={on() && c().lfontOn ? c().lfontOn : c().lfont}
            fontSize={c().lsize}
            x={c().lx}
            y={c().ly}
            lineHeight={c().lh}
            maxWidth={c().lmax}
            maxLines={1}
            letterSpacing={c().lspace || 0}
            color={on() ? c().labelOn : c().labelOff}
          >
            {c().label}
          </text>
        </Show>
      </view>
      <view>
        <Show when={c().value}>
          <text
            fontFamily={c().vfont}
            fontSize={c().vsize}
            x={c().vx}
            y={c().vy}
            maxWidth={c().vmax}
            maxLines={1}
            color={on() ? c().inkOn : c().valueOff}
            alpha={c().valueAlpha}
          >
            {c().value}
          </text>
        </Show>
      </view>
      <view>
        <Show when={c().arrow}>
          <view x={c().ax} y={c().ay} width={c().asz} height={c().asz} src={src(c().arrow)} color={on() ? c().inkOn : c().arrowOff} />
        </Show>
      </view>
      <view>
        <Show when={c().chev}>
          <view
            x={c().cx}
            y={c().cy}
            width={c().csz}
            height={c().csz}
            src={src(c().chev)}
            color={on() ? c().inkOn : c().chevOff}
            alpha={c().chevAlpha}
          />
        </Show>
      </view>
    </view>
  )
}
