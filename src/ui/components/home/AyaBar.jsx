import { For, Index, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import NewReleaseLabel from './NewReleaseLabel.jsx'
import { cssShift, fontFor } from '../../text.js'
import { theme, navOnLeft } from '../../theme.js'
import * as settings from '../../../state/settings.js'
import { focusNav } from '../../../app/focus.js'
import { trailerHost } from './trailerHost.js'
import { createBarContext } from './barContext.js'
import { roundedZoom } from './zoomShader.js'
import { backdropOf, breakable, glowOf, imageOf, loadReleases, releaseOf, restartCarousel, stopCarousel, toNum } from './barKit.js'

// The Aya media bar: one slide at a time in a rounded frame, with Home's own backdrop around it
// (Home draws that from onBarSlide, and keeps it around a trailer through onBarTrailer's hole).

const SLIDE_MS = 420
const LOGO_W = 340
const LOGO_H = 100
const EMPTY = {}
const SHIFT = { title: cssShift(34) }
const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)'
const COVER = { resizeMode: { type: 'cover' } }
const BAR_T = { duration: 280, easing: EASE }
const BAR_MOVE = { x: BAR_T, width: BAR_T, color: BAR_T }
const TRAILER_FADE = { alpha: { duration: 300 } }

// The Aya bar asks for the logo itself rather than the slide's LogoUrl.
const logoUrlOf = (item) => {
  if (item._external) return item.LogoUrl || ''
  return item.ImageTags && item.ImageTags.Logo ? imageOf(item, 'Logo', { maxWidth: 680, quality: 90 }) : ''
}

// While the frame has focus, a slide's art zooms in and eases back out from the moment it mounts.
function AyaSlide(props) {
  let outer
  let img
  let anim = null
  const [nat, setNat] = createSignal(null)
  const [failed, setFailed] = createSignal(false)
  const [titleH, setTitleH] = createSignal(34)
  const it = () => props.item || EMPTY
  const logo = () => (failed() ? '' : logoUrlOf(it()))
  const logoBox = createMemo(() => {
    const d = nat()
    const shown = !!(d && d.src === logo())
    const s = shown ? Math.min(LOGO_W / d.w, LOGO_H / d.h) : 1
    return { w: shown ? d.w * s : LOGO_W, h: shown ? d.h * s : LOGO_H, shown }
  })
  const title = () => (logo() ? '' : it().Name || '')
  const rel = () => props.rel(it().Id)
  const zoomShader = [roundedZoom(), { radius: 18, zoom: 1 }]

  const stop = () => {
    const a = anim
    anim = null
    if (a) a.stop()
  }
  const setZoom = (z) => {
    const sh = img && img.lng && img.lng.shader
    if (sh && sh.props) sh.props.zoom = z
  }
  const depth = (on) => {
    stop()
    setZoom(1)
    if (!on) return
    const first = (anim = img.animate({ shaderProps: { zoom: 1.012 } }, { duration: 320, easing: EASE }))
    first.start()
    first.waitUntilStopped().then(() => {
      if (anim !== first) return
      anim = img.animate({ shaderProps: { zoom: 1 } }, { duration: 8000, easing: 'linear' })
      anim.start()
    })
  }
  createEffect(on(() => props.focused, depth))
  onMount(() => {
    if (!props.entering) return
    outer.alpha = 0
    outer.scale = 1.006
    setTimeout(() => {
      outer.animate({ alpha: 1, scale: 1 }, { duration: SLIDE_MS, easing: EASE }).start()
    }, 0)
  })
  onCleanup(stop)

  return (
    <view ref={outer} width={props.w} height={props.h} pivot={0.5}>
      <view
        ref={img}
        width={props.w}
        height={props.h}
        src={backdropOf(it(), { maxWidth: 1600, quality: 85 }) || undefined}
        textureOptions={COVER}
        shader={zoomShader}
        transition={TRAILER_FADE}
        alpha={props.trailer ? 0 : 1}
      />
      <view
        x={44}
        y={40}
        width={logoBox().w}
        height={logoBox().h}
        src={logo() || undefined}
        alpha={logoBox().shown ? 1 : 0.001}
        onEvent={{
          loaded: (_, e) => {
            const d = e && e.dimensions
            if (d && d.w && d.h) setNat({ src: untrack(logo), w: d.w, h: d.h })
          },
          failed: () => setFailed(true),
        }}
      />
      <text
        x={44}
        y={40 + SHIFT.title}
        fontFamily={fontFor(title(), 'bold')}
        fontSize={34}
        lineHeight={34}
        letterSpacing={-0.5}
        maxWidth={440}
        maxLines={2}
        color={props.ink}
        textShadow={props.shadow}
        onEvent={{ loaded: (_, e) => e && e.dimensions && e.dimensions.h && setTitleH(e.dimensions.h) }}
      >
        {breakable(title())}
      </text>
      <NewReleaseLabel
        x={44}
        y={40 + (logo() ? LOGO_H : titleH()) + 13}
        kind={rel().kind}
        season={rel().season}
        episode={rel().episode}
        tagline={rel().tagline}
      />
    </view>
  )
}

export default function AyaBar(props) {
  // A frame 65 percent of the screen tall, or the room the peek row leaves.
  const frame = createMemo(() => {
    const left = navOnLeft(settings.all())
    const top = left ? 32 : 122
    const x = left ? 88 : 80
    const w = 1920 - x - (left ? 32 : 80)
    const h = props.rowPeek ? 1080 - props.rowPeek - top - 32 : 702
    return { x, y: top, w, h }
  })
  // A trailer only plays while the frame has focus, so it fills the frame as focus scales it.
  const trailerFrame = () => {
    const f = frame()
    return { x: f.x - f.w * 0.003, y: f.y - f.h * 0.003, w: f.w * 1.006, h: f.h * 1.006 }
  }
  const { bar, relVer, holding, active } = createBarContext(props, trailerFrame)
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  // Slide ids: the one showing, and the one fading in over it.
  const [baseId, setBaseId] = createSignal('')
  const [incomingId, setIncomingId] = createSignal('')
  const [preload, setPreload] = createSignal('')
  let want = null
  let settle = null

  const cfg = createMemo(() => {
    const t = theme()
    const glow = t.focusGlow.length ? t.focusGlow : [{ color: t.accentA(0.3), x: 0, y: 0, blur: 18, spread: 1 }]
    return {
      left: navOnLeft(settings.all()),
      bg: t.background,
      onSurface: t.onSurface,
      bar: t.os(0.3),
      ring: { width: 3, color: toNum(t.focus) },
      glowA: glowOf(glow[0]),
      glowB: glowOf(glow[1]),
      drop: glowOf({ color: '#00000038', x: 0, y: 10, blur: 28, spread: 1 }).shadow,
      titleShadow: { color: t.scrim.slice(0, 7) + 'b8', x: 0, y: 0, blur: 20 },
    }
  })
  const count = () => (props.items || []).length
  const safe = () => Math.min(cur(), Math.max(0, count() - 1))
  const byId = (id) => (props.items || []).find((it) => it.Id === id)
  const slideIds = createMemo(() => {
    const out = []
    if (baseId()) out.push(baseId())
    if (incomingId() && incomingId() !== baseId()) out.push(incomingId())
    return out
  })
  const relFor = (id) => {
    relVer()
    return releaseOf(bar, id)
  }
  const bars = createMemo(() => {
    const n = count() < 2 ? 0 : count()
    let total = 0
    for (let i = 0; i < n; i++) total += (i === safe() ? 16 : 10) + 5
    let x = frame().w - 24 - total
    const out = []
    for (let i = 0; i < n; i++) {
      const on = i === safe()
      x += 5
      out.push({ x, w: on ? 16 : 10, on })
      x += on ? 16 : 10
    }
    return out
  })

  // The next slide waits for its artwork, so the fade never shows half an image, and a load the
  // carousel has moved past is dropped.
  const slideChanged = () => {
    const it = (props.items || [])[untrack(safe)]
    if (!it) return
    want = it
    if (props.onBarSlide) props.onBarSlide(it)
    trailer.sync()
    if (!untrack(baseId)) {
      setBaseId(it.Id)
      return
    }
    if (untrack(baseId) === it.Id) return
    const url = backdropOf(it, { maxWidth: 1600, quality: 85 })
    if (!url) bringIn(it)
    else setPreload(url)
  }
  const preloaded = () => {
    if (want && preload() === backdropOf(want, { maxWidth: 1600, quality: 85 })) bringIn(want)
  }
  const bringIn = (it) => {
    setIncomingId(it.Id)
    clearTimeout(settle)
    settle = setTimeout(() => {
      setBaseId(incomingId())
      setIncomingId('')
      // The slide that came in may not be the one wanted any more.
      if (want && want.Id !== baseId()) slideChanged()
    }, SLIDE_MS + 80)
  }
  const step = (delta) => {
    if (count() < 2) return
    setCur((safe() + delta + count()) % count())
    slideChanged()
  }
  const restart = () => restartCarousel(bar, () => step(1))
  const go = (delta) => {
    if (count() < 2) return
    step(delta)
    restart()
  }
  const trailer = trailerHost(bar, { current: () => (props.items || [])[safe()], rect: trailerFrame, onEnded: () => go(1) })

  createEffect(
    on(
      () => props.items,
      () => {
        setCur(0)
        setBaseId('')
        setIncomingId('')
        loadReleases(bar)
        slideChanged()
        if (bar._focused) restart()
      },
    ),
  )
  createEffect(on(holding, restart, { defer: true }))
  onCleanup(() => {
    clearTimeout(settle)
    stopCarousel(bar)
    trailer.destroy()
  })

  const onFocusChanged = (has) => {
    bar._focused = has
    setFocused(has)
    if (has) restart()
    else stopCarousel(bar)
    trailer.focus(has)
  }

  return (
    <view
      ref={(n) => {
        bar.root = n
        n.trailer = trailer
        if (props.ref) props.ref(n)
      }}
      width={1920}
      height={1080}
      alpha={props.alpha === undefined ? 1 : props.alpha}
      onFocusChanged={onFocusChanged}
      onLeft={() => {
        if (cfg().left && safe() === 0) focusNav()
        else go(-1)
        return true
      }}
      onRight={() => {
        go(1)
        return true
      }}
      onEnter={() => {
        const it = (props.items || [])[safe()]
        if (!it) return true
        trailer.stop()
        if (props.onBarInfo) props.onBarInfo(it)
        return true
      }}
    >
      <view width={1} height={1} alpha={0.001} src={preload()} onEvent={{ loaded: preloaded, failed: preloaded }} />
      <view
        x={frame().x}
        y={frame().y}
        width={frame().w}
        height={frame().h}
        pivot={0.5}
        transition={{ scale: { duration: 220, easing: EASE } }}
        scale={focused() ? 1.006 : 1}
      >
        <view width={frame().w} height={frame().h} borderRadius={18} color="#00000000" shadow={cfg().drop} alpha={focused() ? 1 : 0} />
        <view width={frame().w} height={frame().h} clipping>
          <view
            width={frame().w}
            height={frame().h}
            borderRadius={18}
            color={cfg().bg}
            transition={TRAILER_FADE}
            alpha={active() ? 0 : 1}
          />
          <view>
            <For each={slideIds()}>
              {(id) => (
                <AyaSlide
                  item={byId(id)}
                  w={frame().w}
                  h={frame().h}
                  entering={untrack(baseId) !== '' && id === untrack(incomingId)}
                  focused={focused()}
                  trailer={active()}
                  ink={cfg().onSurface}
                  shadow={cfg().titleShadow}
                  rel={relFor}
                />
              )}
            </For>
          </view>
          <view y={22}>
            <Index each={bars()}>
              {(b) => (
                <view
                  transition={BAR_MOVE}
                  x={b().x}
                  width={b().w}
                  height={2}
                  borderRadius={1}
                  color={b().on ? cfg().onSurface : cfg().bar}
                />
              )}
            </Index>
          </view>
        </view>
        <view x={-3.5} y={-3.5} alpha={focused() ? 1 : 0}>
          <view
            width={frame().w + 7}
            height={frame().h + 7}
            borderRadius={21.5}
            color="#00000000"
            shadow={cfg().glowB.shadow}
            alpha={cfg().glowB.on ? 1 : 0}
          />
          <view width={frame().w + 7} height={frame().h + 7} borderRadius={21.5} color="#00000000" shadow={cfg().glowA.shadow} />
          <view width={frame().w + 7} height={frame().h + 7} borderRadius={21.5} color="#00000000" border={cfg().ring} />
        </view>
      </view>
    </view>
  )
}
