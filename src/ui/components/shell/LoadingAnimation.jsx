import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import * as settings from '../../../state/settings.js'
import { textReady } from '../../text.js'
import Runner from './saver/Runner.jsx'
import { MOON_FRAMES, labelImage, moonBackdrop, moonPhases, spinnerArc, spinnerTrack } from './loading/art.js'
import { MOON_PALETTES, anchoredAt, bounceAt, bounceStart, bounceStep, facesLeft, sizeLayout, speedMultiplier } from './loading/layout.js'
import { drawn, spriteFrames } from './sprite.js'

const LOGO_FILES = [36, 64, 110, 170]
const PULSE = { duration: 2000, easing: 'ease-in-out' }

// The chosen loading animation (the turning Moonfin logo, the gradient spinner, the runner or a
// moon going through its phases) with its label under it in pulsing gradient capitals, placed where
// the settings say or bouncing around the screen, over the whole screen dimmed to 45% black when
// `dimmed`. The Player shows it dimmed while a stream loads, and not dimmed while one buffers or
// reconnects. Mount it only while it shows. `prefs` stands in for the saved settings, for the
// settings preview.
export default function LoadingAnimation(props) {
  const s = props.prefs || settings.all()
  const image = s.loadingAnimationImage || 'moonfinLogo'
  const layout = sizeLayout(s.loadingAnimationSize)
  const px = layout.pixelSize
  const position = s.loadingAnimationPosition || 'middle'
  const speed = speedMultiplier(s.loadingAnimationSpeed)
  const showText = s.showLoadingAnimationText !== false
  const hasImage = image !== 'none' && !!image
  const palette = MOON_PALETTES[image]
  const moon = palette ? { back: moonBackdrop(px, palette), frames: spriteFrames(moonPhases(px, palette)) } : null
  const logoSrc = `loading/moonfin-logo-${LOGO_FILES.find((n) => n >= px) || 170}.webp`

  const [labelArt, setLabelArt] = createSignal(null)
  const [pulse, setPulse] = createSignal(false)
  const [left, setLeft] = createSignal(facesLeft(position))
  const [moonFrame, setMoonFrame] = createSignal(0)
  let boxNode
  let logoNode
  let arcNode
  let dead = false
  let raf = null
  let wait = null
  const timers = []

  const text = () => (showText && props.label ? String(props.label).trim().toUpperCase() : '')

  // The overlay's column: the image on top, the label under it, both centered on the wider one.
  const box = createMemo(() => {
    const img = hasImage ? px : 0
    const lab = labelArt()
    const w = Math.max(img, lab ? lab.w : 0)
    const labelY = img + (hasImage && lab ? layout.labelSpacing : 0)
    const h = labelY + (lab ? lab.h : 0)
    const at = anchoredAt(position, w, h)
    return { w, h, x: at.x, y: at.y, imgX: (w - img) / 2, labelX: lab ? (w - lab.w) / 2 : 0, labelY }
  })

  // The label is drawn in the browser's own Roboto Bold, so it waits for that face.
  createEffect(
    on(text, (label) => {
      if (!label) return setLabelArt(null)
      textReady().then(() => {
        if (!dead && label === text()) setLabelArt(labelImage(label, layout.labelFontSize, layout.labelLetterSpacing, 'measure-bold'))
      })
    }),
  )

  // Every frame: the logo turning about its upright axis (8s a turn at full speed), the spinner's
  // arc (1.2s), the moon's phase (6s) and the bouncing position. Hidden, it checks back slowly.
  const animate = () => {
    const started = Date.now()
    const bouncing = position === 'bouncing'
    const motion = bounceStart()
    let last = null
    const frame = () => {
      if (dead) return
      if (!drawn(boxNode)) {
        last = null
        wait = setTimeout(() => (raf = requestAnimationFrame(frame)), 250)
        return
      }
      const now = Date.now()
      const t = now - started
      if (image === 'moonfinLogo') {
        const period = Math.round(8000 / speed)
        logoNode.lng.scaleX = Math.cos((2 * Math.PI * (t % period)) / period)
      } else if (image === 'spinner') {
        const period = Math.round(1200 / speed)
        arcNode.lng.rotation = (2 * Math.PI * (t % period)) / period
      } else if (palette) {
        const period = 6000 / speed
        const f = Math.floor(((t % period) / period) * MOON_FRAMES)
        if (f !== moonFrame()) setMoonFrame(f)
      }
      if (bouncing) {
        bounceStep(motion, last == null ? 0 : now - last, speed)
        const at = bounceAt(motion, box().w, box().h)
        boxNode.lng.x = at.x
        boxNode.lng.y = at.y
        if (left() !== motion.vx < 0) setLeft(motion.vx < 0)
      }
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
  }

  onMount(() => {
    // The label pulses up and back every 2s, starting dim.
    timers.push(setTimeout(() => setPulse(true), 32))
    timers.push(setInterval(() => setPulse(!pulse()), 2000))
    animate()
  })
  onCleanup(() => {
    dead = true
    clearTimeout(wait)
    timers.forEach((id) => {
      clearTimeout(id)
      clearInterval(id)
    })
    if (raf) cancelAnimationFrame(raf)
  })

  return (
    <view width={1920} height={1080} color={props.dimmed ? '#00000073' : '#00000000'}>
      <view ref={boxNode} x={box().x} y={box().y} width={box().w} height={box().h}>
        <view x={box().imgX} width={px} height={px}>
          <view ref={logoNode} width={px} height={px}>
            <Show when={image === 'moonfinLogo'}>
              <view width={px} height={px} src={logoSrc} />
            </Show>
          </view>
          <view>
            <Show when={image === 'spinner'}>
              <view width={px} height={px} src={spinnerTrack(px)} />
            </Show>
          </view>
          <view ref={arcNode} width={px} height={px}>
            <Show when={image === 'spinner'}>
              <view width={px} height={px} src={spinnerArc(px)} />
            </Show>
          </view>
          <view>
            <Show when={image === 'runner'}>
              <Runner size={px} speed={speed} left={left()} />
            </Show>
          </view>
          <view>
            <Show when={moon}>
              <view width={px} height={px}>
                <view x={-px / 2} y={-px / 2} width={px * 2} height={px * 2} src={moon.back} />
                <view width={px} height={px} texture={moon.frames[moonFrame()]} />
              </view>
            </Show>
          </view>
        </view>
        <view>
          <Show when={labelArt()}>
            <view
              x={box().labelX}
              y={box().labelY}
              width={labelArt().w}
              height={labelArt().h}
              src={labelArt().src}
              alpha={pulse() ? 1 : 0.4}
              scale={pulse() ? 1 : 0.98}
              transition={{ alpha: PULSE, scale: PULSE }}
            />
          </Show>
        </view>
      </view>
    </view>
  )
}
