import { Show, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js'
import { formatClockTime, shiftedNow } from '../../../utils/clock.js'
import { normalLine, normalShift } from '../../text.js'
import Runner from '../shell/saver/Runner.jsx'
import { gradientFrame, gradientImages, isGradientBackdrop } from '../shell/saver/gradient.js'
import { drawn } from '../shell/sprite.js'
import { gradientUrl } from './mediaBarKit.js'
import { CONTAIN, COVER } from './kit.js'

// The screensaver over the Home preview: the first sample title's backdrop or the animated palette,
// dimmed by Dimming Level, with the logo, clock or runner placed by Position and Size, drifting
// about at the Movement speed. Filling the screen, the parts keep the share of it the real
// screensaver gives them, half of the TV's here. The palette is the real screensaver's
// (shell/saver/gradient.js) at half size.
const SIZE_SCALE = { thumbnail: 0.45, small: 0.7, medium: 1.0, large: 1.5 }
const MOVEMENT_SPEED = { staticCorner: 0, slow: 0.45, moderate: 0.7, fast: 1.0, ultra: 1.6 }
const COMPONENT_SIZE = { moonfinLogo: { w: 320, h: 140 }, clock: { w: 200, h: 56 }, runner: { w: 120, h: 120 } }
// The anchored layer's inset and the bounce's margin, in the frame's pixels.
const INSET = 12
const MARGIN = 20
const SPEED = 30
const ZOOM = 0.5
const RUNNER_SIZE = 96
const CLOCK_SIZE = 32

export default function ScreensaverPreview(props) {
  const [clockText, setClockText] = createSignal('')
  const [left, setLeft] = createSignal(false)
  let mover
  let orbit
  let flash
  let accent
  let accentInner
  let leg = null
  let anim = null
  let raf = 0
  const component = () => props.s.screensaverComponent || 'moonfinLogo'
  const backdrop = () => props.s.screensaverBackdrop || 'library'
  const libraryUrl = () => {
    const item = (props.items || [])[0]
    return backdrop() === 'library' && item ? item.backdropUrl || '' : ''
  }
  const radial = createMemo(() =>
    backdrop() === 'library' && !libraryUrl()
      ? gradientUrl({ w: 960, h: 540, rx: 551, ry: 551, cx: 480, cy: 270, stops: [['#1e293bff', 0], ['#0f172aff', 0.5], ['#050811ff', 1]] })
      : '',
  )
  const gradKey = createMemo(() => (isGradientBackdrop(backdrop()) ? backdrop() : ''))
  const gradient = createMemo(() => (gradKey() ? { backdrop: gradKey(), ...gradientImages(gradKey()) } : null))
  const dim = () => Math.max(0, Math.min(100, props.s.screensaverDimmingLevel != null ? props.s.screensaverDimmingLevel : 50)) / 100
  const scale = () => SIZE_SCALE[props.s.screensaverSize] || SIZE_SCALE.medium
  const speed = () => {
    const m = MOVEMENT_SPEED[props.s.screensaverMovement]
    return m === undefined ? MOVEMENT_SPEED.moderate : m
  }
  const sameBox = (a, b) => a.w === b.w && a.h === b.h
  const box = createMemo(
    () => {
      const size = COMPONENT_SIZE[component()] || COMPONENT_SIZE.moonfinLogo
      return { w: Math.round(size.w * ZOOM * scale()), h: Math.round(size.h * ZOOM * scale()) }
    },
    undefined,
    { equals: sameBox },
  )
  // Where an anchored box sits inside the inset layer.
  const anchor = createMemo(() => {
    const pos = props.s.screensaverPosition || 'middle'
    const w = 960 - 2 * INSET
    const h = 540 - 2 * INSET
    const b = box()
    const col = /Left$/.test(pos) ? 0 : /Right$/.test(pos) ? w - b.w : (w - b.w) / 2
    const row = /^top/.test(pos) ? 0 : /^bottom/.test(pos) ? h - b.h : (h - b.h) / 2
    return { x: INSET + col, y: INSET + row }
  }, undefined, { equals: (a, b) => a.x === b.x && a.y === b.y })
  const clockSize = () => Math.round(CLOCK_SIZE * ZOOM * scale())
  const runnerSize = () => Math.round(RUNNER_SIZE * ZOOM * scale())

  const tick = () => setClockText(formatClockTime(shiftedNow(props.s.timeOffsetHours || 0), props.s.clockDisplay))
  tick()
  const clock = setInterval(() => drawn(mover) && tick(), 1000)

  // Anchored when Movement is Static, else drifting from a random spot and turning at the walls as
  // the real screensaver does, each straight leg one linear animation.
  const place = () => {
    clearTimeout(leg)
    if (anim) anim.stop()
    anim = null
    if (!mover) return
    const b = box()
    const v = SPEED * speed()
    if (!v) {
      mover.x = anchor().x
      mover.y = anchor().y
      return
    }
    const maxX = 960 - b.w - MARGIN
    const maxY = 540 - b.h - MARGIN
    if (maxX <= MARGIN || maxY <= MARGIN) return
    let x = MARGIN + Math.random() * (maxX - MARGIN)
    let y = MARGIN + Math.random() * (maxY - MARGIN)
    let dx = Math.random() > 0.5 ? 1 : -1
    let dy = Math.random() > 0.5 ? 1 : -1
    mover.x = x
    mover.y = y
    setLeft(dx < 0)
    const step = () => {
      const tx = (dx > 0 ? maxX - x : x - MARGIN) / v
      const ty = (dy > 0 ? maxY - y : y - MARGIN) / v
      const t = Math.max(0.05, Math.min(tx, ty))
      x += dx * v * t
      y += dy * v * t
      setLeft(dx < 0)
      anim = mover.animate({ x, y }, { duration: t * 1000, easing: 'linear' })
      anim.start()
      if (tx <= ty) dx = -dx
      if (ty <= tx) dy = -dy
      leg = setTimeout(step, t * 1000)
    }
    leg = setTimeout(step, 30)
  }
  let kick = 0
  createEffect(on([speed, box, anchor], () => {
    clearTimeout(kick)
    kick = setTimeout(place, 0)
  }))

  // The palette's keyframes, sampled every frame onto its layers as the real screensaver does.
  createEffect(
    on(gradient, (g) => {
      cancelAnimationFrame(raf)
      if (!g) return
      const started = Date.now()
      const frame = () => {
        raf = requestAnimationFrame(frame)
        if (!orbit || !drawn(orbit)) return
        const pin = window.__moonfinSaver
        const v = gradientFrame(g.backdrop, pin && typeof pin.at === 'number' ? pin.at : Date.now() - started)
        orbit.rotation = v.rotation
        orbit.scale = v.orbitScale
        accent.x = v.driftX
        accent.y = v.driftY
        accent.scale = v.driftScale
        accentInner.alpha = v.accent
        if (flash && g.flash) {
          flash.rotation = v.rotation
          flash.scale = v.orbitScale
          flash.alpha = v.flash
        }
      }
      raf = requestAnimationFrame(frame)
    }),
  )
  onCleanup(() => {
    clearTimeout(kick)
    clearTimeout(leg)
    if (anim) anim.stop()
    clearInterval(clock)
    cancelAnimationFrame(raf)
  })

  return (
    <view width={960} height={540} color="#000000ff" clipping>
      <view width={960} height={540} src={libraryUrl()} color={libraryUrl() ? '#ffffffff' : '#00000000'} textureOptions={COVER} />
      <view width={960} height={540} src={radial()} color={radial() ? '#ffffffff' : '#00000000'} />
      <view x={448} y={238} width={64} height={64} src="icons/preview/movie.webp" color="#00a4dc40" alpha={radial() ? 1 : 0} />
      <view>
        <Show when={gradient()} keyed>
          {(g) => (
            <view scale={0.5} pivot={0} width={1920} height={1080} clipping>
              <view ref={orbit} x={-1536} y={-864} width={4992} height={2808} src={g.orbit} color="#ffffffff" />
              <view ref={flash} x={-1536} y={-864} width={4992} height={2808} src={g.flash || ''} color={g.flash ? '#ffffffff' : '#00000000'} alpha={g.flash ? 0.5 : 0} />
              <view ref={accent} width={1920} height={1080}>
                <view ref={accentInner} width={1920} height={1080} src={g.accent} color="#ffffffff" />
              </view>
            </view>
          )}
        </Show>
      </view>
      <view width={960} height={540} color="#000000ff" alpha={dim()} />
      <view ref={mover} x={untrack(anchor).x} y={untrack(anchor).y} width={box().w} height={box().h}>
        <view width={box().w} height={box().h} src="resources/banner-dark.webp" textureOptions={CONTAIN} alpha={component() === 'moonfinLogo' ? 1 : 0} />
        <text
          x={box().w / 2}
          y={(box().h - normalLine(clockSize())) / 2 + normalShift(clockSize())}
          mountX={0.5}
          fontFamily="roboto-medium"
          fontSize={clockSize()}
          lineHeight={1}
          color="#ffffffff"
          alpha={component() === 'clock' ? 1 : 0}
        >
          {clockText()}
        </text>
        <view>
          <Show when={component() === 'runner'}>
            <Runner x={(box().w - runnerSize()) / 2} y={(box().h - runnerSize()) / 2} size={runnerSize()} speed={speed() > 0 ? speed() : 1} left={left()} />
          </Show>
        </view>
      </view>
    </view>
  )
}
