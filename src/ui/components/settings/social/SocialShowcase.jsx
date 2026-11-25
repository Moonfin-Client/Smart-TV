import { For } from 'solid-js'
import { hex } from '../../../color.js'
import { keyed } from '../../library/pageKit.js'
import { fx } from '../fx.js'
import { COLUMN_W } from '../layoutRows.js'

// The Showcase row: each badge in its shell over its title, the focused one on a lit tile, scrolled
// sideways inside its clip. [m] is the block from build.showcase.

export default function SocialShowcase(props) {
  const items = keyed(() => props.m.items || [], (s) => s.k)
  return (
    <view width={COLUMN_W} height={props.m.h} clipping>
      <For each={items.keys()}>
        {(k) => {
          const s = items.item(k)
          return (
            <view x={s().x} y={4} width={150} height={137}>
              <view
                transition={fx('alpha', 150)}
                width={150}
                height={137}
                borderRadius={12}
                color="#1e1e1eff"
                border={{ width: 1, color: hex('#00a4dcff') }}
                alpha={s().sid === props.focusSid ? 1 : 0}
              />
              <view x={33} y={9} width={84} height={84} borderRadius={22} color={s().fill} border={{ width: 1, color: hex(s().edge) }} />
              <view x={53} y={29} width={44} height={44} src={s().src} color={s().ink} />
              <text
                fontFamily={s().font}
                fontSize={20}
                lineHeight={25}
                x={1}
                y={104.7}
                maxWidth={148}
                maxLines={2}
                contain="width"
                textAlign="center"
                color="#ffffffb3"
              >
                {s().title || ' '}
              </text>
            </view>
          )
        }}
      </For>
    </view>
  )
}
