import { Index, Show, createMemo } from 'solid-js'
import { over, rgbA, toNum } from './barKit.js'

// The Gallery's page: the theme background under a radial glow in the slide's genre color. While a
// trailer plays in the active panel, the ground leaves that panel's rounded rect clear for the video
// under the canvas and stays opaque everywhere else to hide the video's overhang. Props: glow, bg,
// and the hole as hx, hy, hw, hh, hr (hw 0 for none).
const CX = 768
const CY = 594
const R = Math.sqrt(1152 * 1152 + 594 * 594)
const STOPS = [0, 0.1125, 0.225, 0.3375, 0.45, 0.5875, 0.725, 0.8625, 1]
const alphaAt = (d) => (d <= 0.45 ? 0.42 - (0.28 * d) / 0.45 : d >= 1 ? 0 : 0.14 * (1 - (d - 0.45) / 0.55))
const colorAt = (bg, glow, d) => over(bg, rgbA(glow), alphaAt(d))

export default function GalleryGround(props) {
  const bg = () => props.bg || '#000000ff'
  const glow = () => props.glow || '74, 90, 120'
  const hole = createMemo(() => (props.hw > 0 ? { x: props.hx, y: props.hy, w: props.hw, h: props.hh, r: props.hr || 0 } : null))
  const gradient = createMemo(() => ({
    colors: STOPS.map((d) => toNum(colorAt(bg(), glow(), d))),
    stops: STOPS,
    w: R,
    h: R,
    pivot: [CX / 1920, CY / 1080],
  }))
  // Four bands around the hole, plus a corner piece at each of its rounded corners. The bands clip
  // on whole pixels, so their edges are rounded into the hole and no seam of video shows between.
  const bands = createMemo(() => {
    const h = hole()
    if (!h) return []
    const top = Math.ceil(h.y)
    const bottom = Math.floor(h.y + h.h)
    const left = Math.ceil(h.x)
    const right = Math.floor(h.x + h.w)
    return [
      { x: 0, y: 0, w: 1920, h: top },
      { x: 0, y: bottom, w: 1920, h: 1080 - bottom },
      { x: 0, y: top, w: left, h: bottom - top },
      { x: right, y: top, w: 1920 - right, h: bottom - top },
    ]
  })
  const corners = createMemo(() => {
    const h = hole()
    if (!h || !h.r) return []
    const r = h.r
    const at = (x, y) => colorAt(bg(), glow(), Math.sqrt((x - CX) * (x - CX) + (y - CY) * (y - CY)) / R)
    return [
      { x: h.x, y: h.y, hx: 0, hy: 0 },
      { x: h.x + h.w - r, y: h.y, hx: -r, hy: 0 },
      { x: h.x, y: h.y + h.h - r, hx: 0, hy: -r },
      { x: h.x + h.w - r, y: h.y + h.h - r, hx: -r, hy: -r },
    ].map((c) => ({ x: c.x, y: c.y, r, color: at(c.x, c.y), shader: ['holePunch', { x: c.hx, y: c.hy, w: r * 2, h: r * 2, radius: r }] }))
  })
  return (
    <view width={1920} height={1080}>
      <view>
        <Show when={!hole()}>
          <view width={1920} height={1080} color="#ffffffff" radialGradient={gradient()} />
        </Show>
      </view>
      <view>
        <Index each={bands()}>
          {(b) => (
            <view x={b().x} y={b().y} width={b().w} height={b().h} clipping>
              <view x={-b().x} y={-b().y} width={1920} height={1080} color="#ffffffff" radialGradient={gradient()} />
            </view>
          )}
        </Index>
      </view>
      <view>
        <Index each={corners()}>
          {(c) => <view x={c().x} y={c().y} width={c().r} height={c().r} color={c().color} shader={c().shader} />}
        </Index>
      </view>
    </view>
  )
}
