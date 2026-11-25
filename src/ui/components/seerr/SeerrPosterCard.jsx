import { For, Show } from 'solid-js'
import { highMs } from '../../tier.js'
import { uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { shadowColor } from '../../theme.js'
import { tx } from '../../fx.js'

// A Seerr title's poster with its type badge, its status dot or banner, and its title and a line
// under it, as the Discover rows and the Browse grid draw it. Purely visual, the holder passes
// `focused`. A focused poster grows from the bottom of its art when `zoom` is on. Captions sit 2px
// under their CSS line box, since the renderer sets text that much higher.
// card: { image, title, titleFont, subtitle, subtitleFont, subParts, marks, initial,
// placeholderIcon } (marks from look.js posterMarks). `w` is the art's width and `h` its height.
// `art` replaces the poster, `ringW` the focus ring's 5px. `openMs` times a width change, as a
// Discover card opening does.
const COVER = { resizeMode: { type: 'cover' } }
const DOT_SHADOW = { color: shadowColor('#00000099'), x: 0, y: 2.5, blur: 7, spread: 0 }

export default function SeerrPosterCard(props) {
  const badgeFont = uiFont('bold')
  const c = () => props.card || {}
  const marks = () => c().marks || {}
  const src = () => props.art || c().image || ''
  const grow = () => (props.openMs ? { duration: props.openMs, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' } : undefined)
  return (
    <view
      transition={tx({ x: grow(), width: grow() })}
      x={props.x || 0}
      y={props.y || 0}
      width={props.w}
      height={props.h + 66}
      alpha={props.alpha == null ? 1 : props.alpha}
    >
      <view
        transition={tx({ scale: { duration: highMs(150), easing: 'linear' }, width: grow() })}
        width={props.w}
        height={props.h}
        pivotX={0.5}
        pivotY={1}
        scale={props.focused && props.zoom ? 1.12 : 1}
      >
        <view width={props.w} height={props.h} borderRadius={13} color="#ffffff0d" />
        <view>
          <Show when={src()}>
            <view width={props.w} height={props.h} borderRadius={13} src={src()} textureOptions={COVER} />
          </Show>
        </view>
        <view>
          <Show when={!src()}>
            <view width={props.w} height={props.h} borderRadius={13} color={c().placeholderIcon ? '#00000000' : '#2a2a4eff'}>
              <text x={props.w / 2} y={props.h / 2} mountX={0.5} mountY={0.5} fontFamily={c().titleFont} fontSize={64} color="#666666ff">
                {c().initial || ''}
              </text>
              <Show when={c().placeholderIcon}>
                <view x={(props.w - 60) / 2} y={(props.h - 60) / 2} width={60} height={60} src={'icons/' + c().placeholderIcon + '.webp'} color="#ffffff4d" />
              </Show>
            </view>
          </Show>
        </view>
        <view>
          <Show when={marks().banner}>
            {(b) => (
              <view width={props.w} height={33} borderRadius={[13, 13, 0, 0]} color={b().fill}>
                <text
                  x={props.w / 2}
                  mountX={0.5}
                  pivotX={0.5}
                  pivotY={0}
                  scale={b().scale}
                  fontFamily={badgeFont}
                  fontSize={17}
                  letterSpacing={1.7}
                  lineHeight={33}
                  color={b().ink}
                >
                  {b().label}
                </text>
              </view>
            )}
          </Show>
        </view>
        <view>
          <Show when={marks().type}>
            {(tb) => (
              <view x={10} y={marks().typeY} width={tb().w} height={28} borderRadius={7} color={tb().color}>
                <text x={10} y={3} fontFamily={badgeFont} fontSize={17} letterSpacing={1} lineHeight={22} color="#ffffffff">
                  {tb().label}
                </text>
              </view>
            )}
          </Show>
        </view>
        <view>
          <Show when={marks().dot}>
            {(d) => (
              <view
                x={props.w - 10 - d().size}
                y={10}
                width={d().size}
                height={d().size}
                borderRadius={d().size / 2}
                color={d().fill}
                border={{ width: 2, color: hex(d().ring) }}
                shadow={DOT_SHADOW}
              >
                <view x={d().iconAt} y={d().iconAt} width={d().iconSize} height={d().iconSize} src={'icons/' + d().icon + '.webp'} color={d().iconColor} />
              </view>
            )}
          </Show>
        </view>
        <view
          x={-8}
          y={-8}
          width={props.w + 16}
          height={props.h + 16}
          borderRadius={21}
          color="#00000000"
          border={{ width: props.ringW || 5, color: hex(props.ring || '#00a4dcff') }}
          alpha={props.focused ? 1 : 0}
        />
      </view>
      <text
        y={props.h + 12}
        fontFamily={c().titleFont}
        fontSize={22}
        lineHeight={29}
        maxWidth={props.w}
        maxLines={1}
        color={props.titleColor || '#ffffffff'}
      >
        {c().title || ''}
      </text>
      <view>
        <Show when={c().subtitle}>
          <text y={props.h + 41} fontFamily={c().subtitleFont} fontSize={20} lineHeight={27} maxWidth={props.w} maxLines={1} color="#ffffff99">
            {c().subtitle}
          </text>
        </Show>
      </view>
      <view>
        <For each={c().subParts || []}>
          {(sp) => (
            <text x={sp.x} y={props.h + 41} fontFamily={sp.font} fontSize={20} lineHeight={27} maxWidth={props.w - sp.x} maxLines={1} color="#ffffff99">
              {sp.text}
            </text>
          )}
        </For>
      </view>
    </view>
  )
}
