// The subtitle settings rows for a resolved style, laid out as a scrolling list, and the rule for
// where a focused row scrolls to.
import $L from '../../services/i18n.js'
import { getSubtitleBackgroundColorOptions, getSubtitleColorOptions, getSubtitleShadowColorOptions } from '../../utils/subtitleConstants.js'
import { subtitleFontFailed } from '../../services/subtitleFonts.js'
import { getSubtitleFontOptions, getSubtitleStrokeWidthOptions } from '../Settings/settingsOptions.js'

// Each kind of row: height, margin top, margin bottom. Siblings' margins collapse, and a slider
// row's slider sits 64 down and is 42 tall.
const BOX = { button: [70, 5, 15], slider: [122, 5, 15], divider: [1, 10, 10] }
const SLIDER_TOP = 64
const SLIDER_H = 42
export const VIEW_H = 648
// How near an edge a focused row may come before the list scrolls.
const EDGE = 24

const sizeOptions = () => [
  { value: 'small', label: $L('Small') },
  { value: 'medium', label: $L('Medium') },
  { value: 'large', label: $L('Large') },
  { value: 'xlarge', label: $L('Extra Large') },
]
const positionOptions = () => [
  { value: 'bottom', label: $L('Bottom') },
  { value: 'lower', label: $L('Lower') },
  { value: 'middle', label: $L('Middle') },
  { value: 'higher', label: $L('Higher') },
  { value: 'absolute', label: $L('Absolute') },
]
const labelOf = (options, value, fallback) => {
  const hit = options.find((o) => o.value === value)
  return (hit && hit.label) || fallback
}
const onOff = (v) => (v ? $L('On') : $L('Off'))

// Each row: { id, kind, label, value, key, hdr } plus options for a cycling button, toggle for an
// on/off one, or min, max, step and raw for a slider. key is the base setting, and hdr says it has
// an HDR twin. The list carries contentH, and each row its y and the box focus scrolls to.
export const settingRows = (s) => {
  const btn = (id, label, key, hdr, options, fallback) => ({ id, kind: 'button', label, key, hdr, options, value: labelOf(options, s[key], fallback) })
  const toggle = (id, label, key, hdr) => ({ id, kind: 'button', label, key, hdr, toggle: true, value: onOff(s[key]) })
  const slider = (id, label, key, hdr, min, max, step, raw, value) => ({ id, kind: 'slider', label, key, hdr, min, max, step, raw, value })
  const pct = (v) => `${v == null ? '' : v}%`
  const plain = (v) => (v == null ? '' : String(v))
  const divider = (id) => ({ id, kind: 'divider' })
  const fontOptions = getSubtitleFontOptions()
  const font = btn('font', $L('Font'), 'subtitleFont', false, fontOptions, $L('Default'))
  if (subtitleFontFailed(s.subtitleFont)) font.value = $L("Couldn't download {font}").replace('{font}', s.subtitleFont)
  const rows = [
    btn('size', $L('Size'), 'subtitleSize', true, sizeOptions(), $L('Medium')),
    btn('position', $L('Position'), 'subtitlePosition', true, positionOptions(), $L('Bottom')),
    ...(s.subtitlePosition === 'absolute'
      ? [slider('positionAbsolute', $L('Absolute Position'), 'subtitlePositionAbsolute', true, 0, 100, 5, s.subtitlePositionAbsolute, pct(s.subtitlePositionAbsolute))]
      : []),
    divider('d1'),
    slider('opacity', $L('Text Opacity'), 'subtitleOpacity', true, 0, 100, 5, s.subtitleOpacity, pct(s.subtitleOpacity)),
    btn('color', $L('Text Fill Color'), 'subtitleColor', true, getSubtitleColorOptions(), $L('White')),
    toggle('bold', $L('Bold Text'), 'subtitleBold', true),
    font,
    divider('d2'),
    btn('shadowColor', $L('Text Stroke Color'), 'subtitleShadowColor', true, getSubtitleShadowColorOptions(), $L('Black')),
    slider('shadowOpacity', $L('Text Stroke Opacity'), 'subtitleShadowOpacity', true, 0, 100, 5, s.subtitleShadowOpacity, pct(s.subtitleShadowOpacity)),
    slider('shadowBlur', $L('Text Stroke Blur'), 'subtitleShadowBlur', true, 0, 1, 0.1, s.subtitleShadowBlur || 0.1, s.subtitleShadowBlur ? s.subtitleShadowBlur.toFixed(1) : '0.1'),
    btn('strokeWidth', $L('Text Stroke Width'), 'subtitleStrokeWidth', false, getSubtitleStrokeWidthOptions(), $L('Default')),
    divider('d3'),
    toggle('dropShadow', $L('Text Shadow'), 'subtitleDropShadow', false),
    ...(s.subtitleDropShadow
      ? [
          slider('dropShadowIntensity', $L('Shadow Intensity'), 'subtitleDropShadowIntensity', false, 10, 100, 10, s.subtitleDropShadowIntensity, pct(s.subtitleDropShadowIntensity)),
          slider('dropShadowOffset', $L('Shadow Offset'), 'subtitleDropShadowOffset', false, 0, 8, 1, s.subtitleDropShadowOffset, plain(s.subtitleDropShadowOffset)),
          slider('dropShadowBlur', $L('Shadow Blur'), 'subtitleDropShadowBlur', false, 0, 8, 1, s.subtitleDropShadowBlur, plain(s.subtitleDropShadowBlur)),
        ]
      : []),
    divider('d4'),
    btn('bgColor', $L('Background Color'), 'subtitleBackgroundColor', true, getSubtitleBackgroundColorOptions(), $L('Black')),
    slider('bgOpacity', $L('Background Opacity'), 'subtitleBackground', true, 0, 100, 5, s.subtitleBackground, pct(s.subtitleBackground)),
  ]
  let bottom = 0
  let margin = 0
  rows.forEach((r, i) => {
    const [h, mt, mb] = BOX[r.kind]
    r.y = Math.round((bottom + (i ? Math.max(margin, mt) : mt)) * 10) / 10
    r.h = h
    bottom = r.y + h
    margin = mb
    r.focusY = r.kind === 'slider' ? r.y + SLIDER_TOP : r.y
    r.focusH = r.kind === 'slider' ? SLIDER_H : h
  })
  rows.contentH = bottom + margin
  return rows
}

// The next value a slider gets from Left or Right, kept on its step.
export const stepValue = (r, dir) => {
  const v = Math.max(r.min, Math.min(r.max, Number(r.raw || 0) + dir * r.step))
  return Number((Math.round(v / r.step) * r.step).toFixed(r.step < 1 ? 1 : 0))
}

// On focus, a row within 24 of the bottom edge scrolls up until it's 24 clear of it, or to the
// end when that's within 24. One within 24 of the top scrolls down to sit at the top, or to the
// start when that's within 24.
export const scrollTo = (st, r, contentH) => {
  const max = Math.max(0, contentH - VIEW_H)
  let next = st
  if (r.focusY - st - EDGE < 0) {
    next = r.focusY < EDGE ? 0 : r.focusY
  } else if (r.focusY - st + r.focusH + EDGE > VIEW_H) {
    const end = r.focusY + r.focusH - VIEW_H
    next = contentH - (end + VIEW_H) < EDGE ? max : end + EDGE
  }
  return Math.max(0, Math.min(max, next))
}
