import { For, Show } from 'solid-js'
import { glowShadow } from '../../theme.js'
import { hex } from '../../color.js'
import { cssShift, uiFont } from '../../text.js'

// One row of the Download Subtitles modal (SubtitleSearch): a status line, or a result with its
// release name, the provider's details and the flag badges. Details' rows are framed boxes that
// slide 12px right and grow 2% on focus. The player's are flat and only fill.
// Props: `row` (from subtitleSearchLayout), `focused`, `variant`, `look` (colors from the holder).
const MOVE = { duration: 300, easing: 'ease' }

export default function SubtitleRow(props) {
  const framed = () => props.variant !== 'player'
  const on = () => props.focused && framed()
  const glows = () => (on() ? (props.look.glow || []).map((g, i) => glowShadow(g, i)) : [])
  const top = () => props.row.y
  const flagFont = uiFont('bold')
  return (
    <view
      x={on() ? 13 : 1}
      y={props.row.y}
      width={660}
      height={props.row.h}
      scale={on() ? 1.02 : 1}
      transition={{ x: MOVE, scale: MOVE }}
    >
      <view>
        <For each={glows()}>{(g) => <view width={660} height={props.row.h} borderRadius={8} color="#00000000" shadow={g.shadow} />}</For>
      </view>
      <view alpha={framed() ? 1 : 0} width={660} height={props.row.h} borderRadius={8} color="#ffffff14" border={{ width: 1, color: hex('#ffffff26') }} />
      <view
        width={660}
        height={props.row.h}
        borderRadius={framed() ? 8 : 0}
        color={props.look.fill}
        alpha={props.focused ? 1 : 0}
        transition={{ alpha: { duration: 300 } }}
      />
      <view alpha={on() ? 1 : 0} width={660} height={props.row.h} borderRadius={8} color="#00000000" border={{ width: 1, color: hex(props.look.ring) }} />
      <text
        fontFamily={props.row.nameFont}
        fontSize={24}
        x={props.row.nameX}
        y={props.row.nameY - top() + cssShift(24)}
        lineHeight={props.row.nameLh}
        maxWidth={props.row.nameW + 2}
        color="#ffffffff"
      >
        {props.row.name || ' '}
      </text>
      <view>
        <Show when={props.row.info}>
          <text
            fontFamily={props.row.infoFont}
            fontSize={20}
            x={props.row.infoX}
            y={props.row.infoY - top() + cssShift(20)}
            lineHeight={24}
            maxWidth={props.row.infoW + 2}
            color="#ffffffb3"
          >
            {props.row.info}
          </text>
        </Show>
      </view>
      <view>
        <For each={props.row.flags}>
          {(f) => (
            <view x={f.x} y={f.y - top()} width={f.w} height={f.h} borderRadius={6} color="#ffffff29">
              <text fontFamily={flagFont} fontSize={16} x={10} y={2 + cssShift(16)} lineHeight={19} letterSpacing={0.4} color="#ffffffd9">
                {f.text}
              </text>
            </view>
          )}
        </For>
      </view>
    </view>
  )
}
