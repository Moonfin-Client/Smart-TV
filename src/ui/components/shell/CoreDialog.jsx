import $L from '../../../services/i18n.js'
import { Show, createMemo } from 'solid-js'
import { theme } from '../../theme.js'
import { hex } from '../../color.js'
import { cssShift, displayFont } from '../../text.js'
import { roboto } from './MessageMarkdown.js'
import { dp, coreFrame } from './coreFrame.js'

// A titled panel over a 54% black scrim, a divider, the holder's body, and an optional dimmed
// Cancel row under a second divider. Its sizes are in dp (1.66957px at 1920), and its 1dp borders
// are drawn 1px wide, as Chrome draws them. The holder draws the body itself at the place
// coreFrame() gives, laid out with the same arguments it hands this frame. It's only visual: the
// holder owns focus and passes `cancelFocused`.
export default function CoreDialog(props) {
  const t = () => theme()
  const L = createMemo(() =>
    coreFrame({ title: props.title, subtitle: props.subtitle, wide: !!props.wide, bodyH: props.bodyH || 0, cancel: !!props.cancel }),
  )
  // The title takes the theme's display face, and the rest stays in Roboto.
  const titleFont = () => displayFont('bold')
  // The theme's panel: its surface at 90%, a faint onSurface edge, and the glass and pixel shapes.
  const panel = () => {
    const th = t()
    if (th.isPixel) return { r: 0, bw: 3, bc: th.surfaceVariant }
    return { r: dp(20), bw: 1, bc: th.isGlass ? '#ffffff33' : th.os(0.12) }
  }
  const glow = () => t().textGlow.length > 0
  return (
    <view width={1920} height={1080}>
      <view width={1920} height={1080} color="#0000008a" />
      <view
        x={L().x}
        y={L().y}
        width={L().w}
        height={L().h}
        borderRadius={panel().r}
        color={t().surface.slice(0, 7) + 'e6'}
        border={{ width: panel().bw, color: hex(panel().bc) }}
      />
      <text
        fontFamily={titleFont()}
        fontSize={33.391}
        x={L().x + 1 + 40.07}
        y={L().titleTop + cssShift(33.391, titleFont())}
        lineHeight={39.068}
        maxWidth={L().w - 2 - 80.139}
        maxLines={1}
        color={glow() ? t().accent : t().onSurface}
        letterSpacing={glow() ? 0.4 : 0}
      >
        {props.title || ' '}
      </text>
      <text
        fontFamily={roboto('regular', props.subtitle || '')}
        fontSize={21.704}
        x={L().x + 1 + 40.07}
        y={L().subtitleY}
        lineHeight={25.394}
        maxWidth={L().w - 2 - 80.139}
        maxLines={1}
        color={t().os(0.54)}
      >
        {props.subtitle || ' '}
      </text>
      <view x={L().x + 1} y={L().dividerY} width={L().w - 2} height={1.67} color={t().os(0.08)} />
      <view>
        <Show when={props.cancel}>
          <view x={L().x + 1} y={L().cancelDivider}>
            <view width={L().w - 2} height={1.67} color={t().os(0.08)} />
            <view y={8.348} width={L().w - 2} height={80.139} color={props.cancelFocused ? t().accentA(0.2) : '#00000000'} />
            <view x={40.07} y={31.722} width={33.391} height={33.391} src="icons/radioUnchecked.webp" color={t().os(0.38)} />
            <text fontFamily={roboto()} fontSize={26.713} x={93.496} y={35.29} lineHeight={31.254} color={t().os(0.5)}>
              {$L('Cancel')}
            </text>
          </view>
        </Show>
      </view>
    </view>
  )
}
