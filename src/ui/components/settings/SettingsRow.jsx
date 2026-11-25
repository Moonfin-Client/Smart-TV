import { For, Show, createMemo } from 'solid-js'
import { hex } from '../../color.js'
import { shadowColor, theme } from '../../theme.js'
import { rowFont } from './rowFont.js'
import { ROW, TOGGLE, dp } from './look.js'
import TileFocus from './TileFocus.jsx'
import SettingsSwitch from './SettingsSwitch.jsx'

// One settings card from layoutRows (a toggle, option, nav, info, slider or reorder row): the tile,
// the icon tile, the title and the line under it, and what sits on the end. A focused card fills
// with the theme's focused button color over [fade] ms and its text turns to that color's ink. [m]
// is the card's model, [p] the settings palette.
const NONE = '#00000000'
const THUMB_SHADOW = { color: shadowColor('#0e0e0e26'), x: 0, y: 1.67, blur: 2.08, spread: 0 }

export default function SettingsRow(props) {
  const m = () => props.m
  const p = () => props.p
  const on = () => !!props.focused
  const plain = () => m().plainCard === true
  // A pixel theme squares off the card, its icon tile and its bubble.
  const sq = (r) => (theme().isPixel ? 0 : r)
  const titleSize = () => m().titleSize || 23.37
  const f = () => props.faces
  const icon = createMemo(() => {
    const r = m()
    if (!r.icon) return null
    const flat = r.iconStyle === 'plain'
    const size = flat ? ROW.plainGlyph : ROW.glyph
    // A glyph with no tile sits at the left of its box, centered on the row.
    return { plain: flat, src: 'icons/settings/' + r.icon + '.webp', size, ax: flat ? 0 : (ROW.tile - size) / 2, ay: r.plainCard ? 0 : (ROW.tile - size) / 2 }
  })
  const glyphColor = () => {
    const r = m()
    const c = p()
    if (r.plainCard) return r.iconStyle === 'checkOn' ? c.accent : c.onSurface
    if (on()) return c.soft
    if (r.iconStyle === 'strong') return c.onSurface
    if (r.iconStyle === 'checkOn') return c.accent
    if (r.iconStyle === 'plain') return r.plainTone === 'strong' ? c.onSurface : c.caption
    return c.glyph
  }
  const titleColor = () => {
    if (plain()) return '#e6e0e9ff'
    if (m().dim) return on() ? p().soft : p().faint
    return on() ? p().strong : m().titleColor || p().onSurface
  }
  const subColor = () => {
    if (plain()) return '#cac4d0ff'
    if (m().subTone === 'desc') return on() ? p().strong : p().onSurface
    return on() ? p().soft : m().subColor || p().caption
  }
  // Keyed by setting, so a card handed another setting shows its switch at once rather than sliding.
  const toggleKey = () => (m().trail === 'toggle' || m().reorderToggle ? 'tg' + m().k : '')
  const swatch = () => {
    const r = m()
    if (r.trail !== 'swatch' && r.trail !== 'circle') return null
    const size = r.trail === 'circle' ? dp(24) : dp(18)
    return { size, color: r.swatch || NONE, edge: r.swatchEdge || p().os(0.24) }
  }
  const slider = () => m().shape === 'slider'
  const sliderFrac = () => {
    const r = m()
    if (r.shape !== 'slider') return 0
    const span = r.max - r.min
    return span > 0 ? Math.min(1, Math.max(0, ((r.value == null ? r.min : r.value) - r.min) / span)) : 0
  }
  const hintColor = (hn) => {
    const c = p()
    if (hn.off) return c.faint
    if (plain()) return c.onSurface
    if (hn.tone === 'lock') return on() ? c.inkThirtyTwo : c.os60
    return on() ? c.soft : c.caption
  }
  const bubbleText = () => (m().bubble == null ? '' : String(m().bubble))
  return (
    <view x={m().x} y={m().y} width={m().w} height={m().h}>
      <view
        width={m().w}
        height={m().h}
        borderRadius={plain() ? 0 : sq(26.71)}
        color={plain() ? NONE : p().tileFill}
        border={{ width: plain() ? 0 : 1, color: hex(m().selected ? p().accent : p().tileBorder) }}
      />
      <TileFocus
        w={m().w}
        h={m().h}
        radius={plain() ? 0 : sq(26.71)}
        on={on()}
        fade={props.fade}
        p={p()}
        glow={!plain()}
        fill={plain() ? p().plainFocus : p().tileFocusFill}
        edge={plain() ? 0 : 1}
      />

      <view>
        <Show when={icon()}>
          {(ic) => (
            <view x={m().iconX} y={m().iconY} width={73.46} height={73.46}>
              <view
                width={73.46}
                height={73.46}
                borderRadius={sq(23.37)}
                color={p().iconFill}
                border={{ width: 1, color: hex(p().iconBorder) }}
                alpha={ic().plain || on() ? 0 : 1}
              />
              <view
                width={73.46}
                height={73.46}
                borderRadius={sq(23.37)}
                color={p().iconFocusFill}
                border={{ width: 1, color: hex(p().iconFocusBorder) }}
                alpha={!ic().plain && on() ? 1 : 0}
              />
              <view x={ic().ax} y={ic().ay} width={ic().size} height={ic().size} src={ic().src} color={glyphColor()} />
            </view>
          )}
        </Show>
      </view>

      <text
        fontFamily={rowFont(m().title, 'bold')}
        fontSize={titleSize()}
        lineHeight={m().titleLH || 27.39}
        x={m().bodyX}
        y={m().titleY + titleSize() * 0.085}
        maxWidth={m().bodyW}
        color={titleColor()}
      >
        {m().title || ' '}
      </text>
      <text
        fontFamily={rowFont(m().sub)}
        fontSize={m().subSize}
        lineHeight={m().subLH}
        x={m().bodyX}
        y={m().subY + m().subSize * 0.085}
        maxWidth={m().bodyW}
        maxLines={m().subMaxLines || 0}
        color={subColor()}
      >
        {m().sub || ' '}
      </text>

      <view>
        <Show when={toggleKey()} keyed>
          {(k) => <SettingsSwitch x={m().trailX - TOGGLE.margin - TOGGLE.w} y={m().trailMid - 26.7} on={m().on} p={p()} slide={k ? props.slide : 0} />}
        </Show>
      </view>

      <view>
        <Show when={m().trail === 'chevron'}>
          <view
            x={m().trailX - 33.39}
            y={m().trailMid - 16.7}
            width={33.39}
            height={33.39}
            src="icons/settings/chevron_right.webp"
            color={on() ? p().soft : p().caption}
          />
        </Show>
      </view>

      <view>
        <Show when={m().trail === 'check' && m().on}>
          <view
            x={m().trailX - 40.07}
            y={m().trailMid - 20.03}
            width={40.07}
            height={40.07}
            src="icons/settings/check.webp"
            color={on() ? p().soft : p().caption}
          />
        </Show>
      </view>

      <view>
        <Show when={m().trail === 'bubble'}>
          <view x={m().trailX - m().bubbleW} y={m().trailMid - m().bubbleH / 2} width={m().bubbleW} height={m().bubbleH}>
            <view
              width={m().bubbleW}
              height={m().bubbleH}
              borderRadius={sq(20.03)}
              color={p().bubbleFill}
              border={{ width: 1, color: hex(p().bubbleBorder) }}
              alpha={on() ? 0 : 1}
            />
            <view
              width={m().bubbleW}
              height={m().bubbleH}
              borderRadius={sq(20.03)}
              color={p().bubbleFocusFill}
              border={{ width: 1, color: hex(p().bubbleFocusBorder) }}
              alpha={on() ? 1 : 0}
            />
            <text
              fontFamily={f() ? f().bubble(bubbleText()) : rowFont(bubbleText(), 'bold')}
              fontSize={f() ? f().bubbleSize : 18.37}
              letterSpacing={f() ? f().bubbleSpacing : 0.83}
              lineHeight={24.49}
              x={(m().bubbleW - m().bubbleTextW - (m().bubbleLines > 1 ? 4 : 24)) / 2}
              y={15.59 + (f() ? f().bubbleDy(bubbleText()) : 0)}
              maxWidth={m().bubbleTextW + (m().bubbleLines > 1 ? 4 : 24)}
              maxLines={m().bubbleLines > 1 ? 3 : 1}
              contain="width"
              textAlign="center"
              color={on() ? p().strong : p().accent}
            >
              {bubbleText() || ' '}
            </text>
          </view>
        </Show>
      </view>

      <view>
        <Show when={swatch()}>
          {(sw) => (
            <view
              x={m().trailX - sw().size}
              y={m().trailMid - sw().size / 2}
              width={sw().size}
              height={sw().size}
              borderRadius={sw().size / 2}
              color={sw().color}
              border={{ width: p().swatchRingW, color: hex(sw().edge) }}
            />
          )}
        </Show>
      </view>

      <view>
        <For each={m().trail === 'reorder' ? m().hints || [] : []}>
          {(hn) => (
            <view x={hn.x} y={m().trailMid - hn.size / 2} width={hn.size} height={hn.size} src={hn.src} color={hintColor(hn)} />
          )}
        </For>
      </view>

      <view>
        <Show when={slider()}>
          <text
            fontFamily={rowFont(m().valueText || '')}
            fontSize={20.03}
            lineHeight={23.48}
            x={m().bodyX}
            y={m().valueY + 1.7}
            color={on() ? p().soft : p().caption}
          >
            {m().valueText || ' '}
          </text>
          <view x={m().trackX} y={m().trackMid - 3.34} width={m().trackW} height={6.68} borderRadius={3.34} color={p().rangeTrack} />
          <view
            x={m().trackX}
            y={m().trackMid - 5.01}
            width={Math.max(0.01, m().trackW * sliderFrac())}
            height={10.02}
            borderRadius={5.01}
            color={p().rangeProgress}
          />
          <view>
            <For each={m().ticks || []}>
              {(tk) => <view x={tk.x - 1.67} y={m().trackMid - 1.67} width={3.34} height={3.34} borderRadius={1.67} color={p().tick} />}
            </For>
          </view>
          <view
            x={m().trackX + m().trackW * sliderFrac() - 16.7}
            y={m().trackMid - 16.7}
            width={33.39}
            height={33.39}
            borderRadius={16.7}
            color="#00000000"
            shadow={THUMB_SHADOW}
          />
          <view
            x={m().trackX + m().trackW * sliderFrac() - 16.7}
            y={m().trackMid - 16.7}
            width={33.39}
            height={33.39}
            borderRadius={16.7}
            color={p().rangeThumb}
          />
        </Show>
      </view>
    </view>
  )
}
