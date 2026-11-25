// A CSS gradient as the renderer's stops, sampled evenly. The samples blend premultiplied as CSS
// does, so a fade to transparent keeps its color. Colors are 0xRRGGBBAA, as the shaders take them.
export const cssStops = (colors, stops, count = 17) => {
  const channel = (c, shift) => (c >>> shift) & 255
  const mix = (a, b, t) => {
    const aa = channel(a, 0) / 255
    const ba = channel(b, 0) / 255
    const alpha = aa + (ba - aa) * t
    let out = 0
    for (let shift = 24; shift >= 8; shift -= 8) {
      const pm = channel(a, shift) * aa + (channel(b, shift) * ba - channel(a, shift) * aa) * t
      out = out * 256 + Math.round(alpha > 0 ? pm / alpha : channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t)
    }
    return out * 256 + Math.round(alpha * 255)
  }
  const outColors = []
  const outStops = []
  for (let i = 0; i < count; i++) {
    const at = i / (count - 1)
    let k = 0
    while (k < stops.length - 2 && at > stops[k + 1]) k++
    const t = Math.max(0, Math.min(1, (at - stops[k]) / (stops[k + 1] - stops[k])))
    outColors.push(mix(colors[k], colors[k + 1], t))
    outStops.push(at)
  }
  return { colors: outColors, stops: outStops }
}

// A CSS box-shadow as a node placed under the box. The renderer's shadow takes CSS's own values
// (see glowShadow in ui/theme.js), so the node is the box itself.
export const cssShadow = (w, h, r, { x = 0, y = 0, blur = 0, spread = 0, color }) => ({
  x: 0,
  y: 0,
  w,
  h,
  r: Math.max(0, Math.min(r, w / 2, h / 2)),
  shadow: { color, x, y, blur, spread },
})
