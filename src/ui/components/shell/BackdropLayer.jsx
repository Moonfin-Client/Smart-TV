import { Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import { serverBlurredUrl } from '../../../utils/serverBlur.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { theme } from '../../theme.js'
import { rgbTriplet } from '../../themeColor.js'
import { shownColor } from './pageColor.js'

// Two layers that cross fade to the focused title's backdrop half a second after focus settles,
// placed full screen, in the top right corner or along the top, under the theme's scrim. The corner
// and top placements fade out at their edges. Over a plain background, a fade like that is the same
// as laying the background over the picture in the inverse gradient, so these draw baked gradients
// of the page color instead of a mask. A blur comes from the server, which sends the picture blurred.
//
// Props: `url`, `blur`, `placement` ('fullScreen', 'corner', 'top' or 'off') and `overlayOpacity`.
// Home also passes `bg` and `scrim` (the page color and the scrim, the theme's by default),
// `instant` to show the picture at once for a copy joining one already showing it, and `flat`: the
// page color under the scrim as one opaque color, which the backdrop then draws itself, as one
// layer where the page and the scrim were two.
const DEBOUNCE_MS = 500
// The edge fade's stops, as the cover's strength at each offset.
const FADE = [[0, 1], [0.12, 0.85], [0.3, 0.5], [0.48, 0.15], [0.6, 0], [1, 0]]
const COVER = { resizeMode: { type: 'cover' } }
const CROSS = { duration: 450, easing: 'ease' }

const baked = {}
const fadeSrc = (to, rgb) => {
  const key = to + rgb
  if (baked[key] === undefined) {
    baked[key] = scrimSrc([{ to, rgb, stops: FADE }])
  }
  return baked[key]
}

// The box the picture fills for each placement.
const BOXES = {
  fullScreen: { x: 0, y: 0, w: 1920, h: 1080 },
  top: { x: 0, y: 0, w: 1920, h: 1080 },
  corner: { x: 576, y: 0, w: 1344, h: 810 },
}

export default function BackdropLayer(props) {
  const bg = () => shownColor(props.bg || theme().background)
  const scrim = () => {
    if (props.scrim) return props.scrim
    const c = theme().scrim
    if (typeof props.overlayOpacity !== 'number') return c
    const a = Math.round(parseInt(c.slice(7, 9) || 'ff', 16) * props.overlayOpacity)
    return c.slice(0, 7) + (a < 16 ? '0' : '') + a.toString(16)
  }
  const box = () => BOXES[props.placement] || BOXES.fullScreen
  const blurred = () => !!(props.url && serverBlurredUrl(props.url, Number(props.blur) || 0))
  // A blurred picture keeps the 3% oversize that hides a blur's darkened edges.
  const layer = createMemo(() => {
    const b = box()
    return blurred() ? { x: b.x - b.w * 0.03, y: b.y - b.h * 0.03, w: b.w * 1.06, h: b.h * 1.06 } : b
  })
  const target = createMemo(() => {
    if (!props.url || props.placement === 'off') return ''
    return serverBlurredUrl(props.url, Number(props.blur) || 0) || props.url
  })

  const start = props.instant ? target() : ''
  const [a, setA] = createSignal(start)
  const [b, setB] = createSignal('')
  const [showA, setShowA] = createSignal(true)
  const [shown, setShown] = createSignal(!!start)
  const [pending, setPending] = createSignal('')
  let timer = null

  createEffect(
    on(
      target,
      (url) => {
        clearTimeout(timer)
        // Clearing fades both layers out and keeps the picture they hold.
        if (!url) {
          setPending('')
          setShown(false)
          return
        }
        if (url === (showA() ? a() : b())) {
          setShown(true)
          return
        }
        timer = setTimeout(() => setPending(url), DEBOUNCE_MS)
      },
      { defer: !!start },
    ),
  )
  onCleanup(() => clearTimeout(timer))

  // A picture that took its time to come in is dropped if focus has moved on since.
  const arrived = () => {
    const url = pending()
    if (!url || url !== target()) return
    if (showA()) setB(url)
    else setA(url)
    setShowA(!showA())
    setShown(true)
    setPending('')
  }

  // Page color over the page draws nothing, so the covers wait for a first picture. Carousel and
  // Modern rows never show one, and the two covers were a screen of fill on every frame.
  const covers = createMemo(() => {
    if (!a() && !b()) return []
    const rgb = rgbTriplet(bg())
    const bx = box()
    if (props.placement === 'corner') {
      return [
        { x: bx.x, y: bx.y, w: bx.w, h: bx.h, src: fadeSrc('right', rgb) },
        { x: bx.x, y: bx.y, w: bx.w, h: bx.h, src: fadeSrc('top', rgb) },
      ]
    }
    if (props.placement === 'top') return [{ x: 0, y: 0, w: 1920, h: 540, src: fadeSrc('top', rgb) }]
    return []
  })
  const picture = () => !!(a() || b())

  return (
    <view width={1920} height={1080}>
      <view>
        <Show when={props.flat && picture()}>
          <view width={1920} height={1080} color={bg()} />
        </Show>
      </view>
      <view width={1} height={1} alpha={0.001} src={pending()} onEvent={{ loaded: arrived, failed: arrived }} />
      <view
        x={layer().x}
        y={layer().y}
        width={layer().w}
        height={layer().h}
        src={a()}
        textureOptions={COVER}
        alpha={shown() && showA() ? 1 : 0}
        transition={{ alpha: CROSS }}
      />
      <view
        x={layer().x}
        y={layer().y}
        width={layer().w}
        height={layer().h}
        src={b()}
        textureOptions={COVER}
        alpha={shown() && !showA() ? 1 : 0}
        transition={{ alpha: CROSS }}
      />
      <view>
        <Show when={covers()[0]}>
          <view x={covers()[0].x} y={covers()[0].y} width={covers()[0].w} height={covers()[0].h} src={covers()[0].src} />
        </Show>
      </view>
      <view>
        <Show when={covers()[1]}>
          <view x={covers()[1].x} y={covers()[1].y} width={covers()[1].w} height={covers()[1].h} src={covers()[1].src} />
        </Show>
      </view>
      <view>
        <Show when={props.placement === 'top'}>
          <view y={540} width={1920} height={540} color={bg()} />
        </Show>
      </view>
      <view width={1920} height={1080} color={props.flat && !picture() ? props.flat : scrim()} />
    </view>
  )
}
