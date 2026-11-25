import $L from '../../../services/i18n.js'
import { Index, Show, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js'
import NewReleaseLabel from './NewReleaseLabel.jsx'
import RatingsRow from './RatingsRow.jsx'
import CarouselArrow, { arrowSpots } from './CarouselArrow.jsx'
import Frost from './Frost.jsx'
import { cssShift, displayFont, fontFor, themeSpacing, uiFont } from '../../text.js'
import { theme, navOnLeft } from '../../theme.js'
import { perfTier, tier } from '../../tier.js'
import { formatDuration } from '../../../utils/helpers.js'
import * as settings from '../../../state/settings.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import { focusNav } from '../../../app/focus.js'
import { panelColor } from './featured.js'
import { trailerHost } from './trailerHost.js'
import { createBarContext } from './barContext.js'
import { backdropOf, breakable, frostOf, glowOf, logoOf, shade, loadReleases, releaseOf, restartCarousel, stopCarousel } from './barKit.js'
import { tx } from '../../fx.js'
import { pointerFocus } from '../../../app/pointer.js'

// The default Moonfin media bar: the slide's backdrop over the whole screen, its logo or title in
// the corner and a frosted info box along the bottom. While a trailer shows, the backdrop and the
// dots fade, the box loses its fill and its details collapse, and with the peek row on the box drops
// back to where it sits without one. bars.js says how Home holds it.

const GENRES = 3
const LOGO_W = 406
const LOGO_H = 174
const OVERVIEW_H = 84
const DETAILS_MAX = 200
const BOX_MS = 250
const EMPTY = {}
const SHIFT = { title: cssShift(41), meta: cssShift(17), overview: cssShift(20) }
const COVER = { resizeMode: { type: 'cover' } }
const FADE = { alpha: { duration: 250, easing: 'ease' } }
const DOT_T = { duration: 200, easing: 'ease' }
const DOT_MOVE = { x: DOT_T, y: DOT_T, width: DOT_T, height: DOT_T, color: { duration: 300, easing: 'ease' } }
const TITLE_SHADOW = { color: '#000000e6', x: 2, y: 2, blur: 12 }
const OVERVIEW_SHADOW = { color: '#000000e6', x: 1, y: 1, blur: 6 }
const GLOW_NONE = { color: 0, x: 0, y: 0, blur: 0, spread: 0 }

// What a slide's details line shows: the year, the rating, the runtime and its first genres.
const metaParts = (it) => {
  const parts = []
  if (it.ProductionYear) parts.push({ text: String(it.ProductionYear) })
  if (it.OfficialRating) parts.push({ text: it.OfficialRating, badge: true })
  if (it.RunTimeTicks && it.Type !== 'Series') {
    const dur = formatDuration(it.RunTimeTicks)
    if (dur && dur !== '0m') parts.push({ text: dur })
  }
  ;(it.Genres || []).slice(0, GENRES).forEach((g) => parts.push({ text: g }))
  return parts
}

export default function FeaturedBar(props) {
  const { bar, relVer, holding, active } = createBarContext(props)
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const [backdrop, setBackdrop] = createSignal('')
  const [pending, setPending] = createSignal('')
  // The slide whose backdrop is up, which the glass blurs (the next one shows once it has loaded).
  const [shown, setShown] = createSignal(null)
  let pendingItem = null
  const [logoNat, setLogoNat] = createSignal({ src: '', w: 1, h: 1 })
  const [brokenLogo, setBrokenLogo] = createSignal('')
  const [titleH, setTitleH] = createSignal(43)
  const [ratingsH, setRatingsH] = createSignal(0)
  const [boxMs, setBoxMs] = createSignal(0)
  const [metaW, setMetaW] = createSignal({})
  const [bulletW, setBulletW] = createSignal(9)

  const cfg = createMemo(() => {
    const s = settings.all()
    const t = theme()
    const neon = t.id === 'neon_pulse'
    const glow = t.textGlow[0]
    return {
      left: navOnLeft(s),
      hideDesc: s.hideHomeMediaDescription === true,
      spacing: themeSpacing(),
      titleFont: neon ? displayFont('bold') : null,
      titleInk: neon ? t.accent : t.onBackground,
      titleSpacing: neon ? 0.4 : 0,
      titleShadow: neon ? { color: glow ? glow.color : '#ff2e9259', x: glow ? glow.x : 0, y: glow ? glow.y : 0, blur: glow ? glow.blur : 8 } : TITLE_SHADOW,
      dotOn: neon ? t.accent : t.onSurface,
      dotGlow: neon ? glowOf({ color: t.accentA(0.5), x: 0, y: 0, blur: 6, spread: 0 }).shadow : null,
      // The pixel theme squares the box and the dots' pill.
      radius: t.isPixel ? 0 : 16,
      pillRadius: t.isPixel ? 0 : 17,
      bold: uiFont('bold'),
      mdb: isMdblistEnabled(s, 'mediaBar'),
      fill: panelColor(),
      border: shade(t.cardBorder),
      badgeBorder: shade({ w: 1, color: t.os(0.4) }),
      glowA: glowOf(t.focusGlow[0]),
      glowB: glowOf(t.focusGlow[1]),
      onBg: t.onBackground,
      onSurface: t.onSurface,
      text: neon ? t.onSurface : t.os(0.9),
      sep: t.os(0.5),
      dot: t.os(0.5),
      pill: t.scrim.slice(0, 7) + '8c',
      arrowInk: t.onButtonNormal,
      arrowRadius: Math.min(35, t.chipRadius),
      // Lower tiers skip the frosted glass, and Chrome 38 never had a backdrop blur.
      frost: perfTier() === 'high' && !tier.legacy,
    }
  })
  const count = () => (props.items || []).length
  const item = createMemo(() => (props.items || [])[cur()] || EMPTY)
  const bannerH = () => 1080 - (props.rowPeek || 0)
  const dropped = () => props.rowPeek > 0 && active() && focused()
  // The box's sides: 104 beside the sidebar, 36 under a top bar, 106 clear of the arrows with the
  // peek row on, and back out when a trailer drops the box.
  const side = () => {
    if (props.rowPeek > 0 && !dropped()) return 106
    return cfg().left ? 104 : 36
  }
  const boxW = () => 1920 - side() * 2
  const pad = () => (active() ? 9 : 17)
  const metaH = () => (item().OfficialRating ? 37 : 33)
  const overview = createMemo(() => {
    if (cfg().hideDesc) return ''
    return item().Overview || $L('No description available.')
  })
  // The details stop at 200px, so a ratings row that wraps cuts into the overview.
  const detailsH = () => (active() ? 0 : Math.min(DETAILS_MAX, ratingsH() + (overview() ? 12 + OVERVIEW_H : 0)))
  // The theme's card border sits inside the box on both sides (2px under the pixel theme).
  const edge = () => cfg().border.w || 0
  const boxH = () => edge() * 2 + pad() * 2 + metaH() + 9 + detailsH()
  const boxY = () => (dropped() ? 1028 : bannerH() - 52) - boxH()
  const logoX = () => (cfg().left ? 186 : 58)
  const logoY = () => (cfg().left ? 81 : 130)
  const logoSrc = createMemo(() => {
    const it = item()
    return it.Id && it.Id !== brokenLogo() ? logoOf(it) : ''
  })
  const logoShown = () => !!logoSrc() && logoNat().src === logoSrc()
  const titleText = () => (logoSrc() ? '' : item().Name || '')
  // The display face covers only Latin, which fontFor tells by picking a Roboto twin.
  const sdfTitle = () => fontFor(titleText(), 'bold').indexOf('-web') < 0
  const rel = createMemo(() => {
    relVer()
    return releaseOf(bar, item().Id)
  })
  // The logo is an inline image, so its line keeps 6px of descent under it.
  const releaseY = () => logoY() + (logoSrc() ? logoNat().h + 6 : titleH()) + 13
  const meta = createMemo(() => {
    const parts = metaParts(item())
    return parts.map((p, i) => ({ text: p.text, font: fontFor(p.text, 'bold'), badge: !!p.badge, last: i === parts.length - 1 }))
  })
  // New slides drop the widths measured for texts none of them show, so they don't pile up as Home
  // reloads the bar.
  createEffect(
    on(
      () => props.items,
      (items) => {
        const known = untrack(metaW)
        const kept = {}
        ;(items || []).forEach((it) => metaParts(it || EMPTY).forEach((p) => known[p.text] && (kept[p.text] = known[p.text])))
        setMetaW(kept)
      },
      { defer: true },
    ),
  )
  // Laid out from the measured text: a badge keeps 7px and a 1px border either side, and a dot
  // sits 9px out from the items around it.
  const metaRow = createMemo(() => {
    const h = metaH()
    const widths = metaW()
    let x = 0
    return meta().map((m) => {
      const w = widths[m.text] || 0
      const out = {
        ...m,
        size: m.badge ? 16 : 17,
        sep: m.last ? '' : '•',
        bx: x,
        bw: w + 16,
        x: m.badge ? x + 8 : x,
        y: (m.badge ? 2 : h / 2 - 16.5) + cssShift(m.badge ? 16 : 17),
      }
      x += m.badge ? w + 16 : w
      out.sx = x + 9
      if (!m.last) x += 18 + bulletW()
      return out
    })
  })
  const dots = createMemo(() => {
    const out = []
    let x = 17
    for (let i = 0; i < count(); i++) {
      const on = i === cur()
      out.push({ x, y: on ? 9 : 10, s: on ? 14 : 12, on })
      x += (on ? 14 : 12) + 12
    }
    return out
  })
  const dotsW = () => (count() ? 48 + (count() - 1) * 24 : 0)
  const arrows = createMemo(() => arrowSpots(count(), bannerH(), cfg().left))
  // A playing trailer has nothing behind the glass to blur.
  const frost = () => (cfg().frost && !active() ? frostOf(shown()) : '')

  const slideChanged = () => {
    const it = (props.items || [])[untrack(cur)]
    if (!it) return
    // The old backdrop stays up until the next one has loaded.
    const src = backdropOf(it, { maxWidth: 1920, quality: 85 })
    pendingItem = it
    if (src === untrack(backdrop)) {
      setPending('')
      setShown(it)
    } else setPending(src)
    if (props.onBarSlide) props.onBarSlide(it)
    trailer.sync()
  }
  const pendingLoaded = () => {
    if (!pending()) return
    setBackdrop(pending())
    setShown(pendingItem)
  }
  const step = (delta) => {
    if (count() < 2) return
    setCur((cur() + delta + count()) % count())
    slideChanged()
  }
  const restart = () => restartCarousel(bar, () => step(1))
  const go = (delta) => {
    if (count() < 2) return
    step(delta)
    restart()
  }
  const trailer = trailerHost(bar, { current: () => (props.items || [])[cur()], hidesChrome: true, onEnded: () => go(1) })

  createEffect(
    on(
      () => props.items,
      () => {
        setCur(0)
        setBrokenLogo('')
        loadReleases(bar)
        slideChanged()
        if (bar._focused) restart()
      },
    ),
  )
  createEffect(on(holding, restart, { defer: true }))
  // Only the trailer's collapse and drop animate the box. A new slide resizes it at once.
  let boxTimer = null
  createEffect(
    on(
      active,
      () => {
        setBoxMs(BOX_MS)
        clearTimeout(boxTimer)
        boxTimer = setTimeout(() => setBoxMs(0), BOX_MS + 50)
      },
      { defer: true },
    ),
  )
  onCleanup(() => {
    clearTimeout(boxTimer)
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
  const boxT = () => {
    const ms = boxMs()
    return ms ? { duration: ms, easing: 'ease' } : undefined
  }
  const sized = () => ({ width: boxT(), height: boxT() })

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
      // A click on the banner opens its title, and the arrows and dots page it (app/pointer.js). The
      // bar spans the screen under Home's rows, so hovering it doesn't take focus from them, and a click
      // below the banner (between the peek row's cards) isn't the banner's.
      pointerItems={() => [{ x: 0, y: 0, w: 1920, h: bannerH() }]}
      onPointerItemClick={() => {
        pointerFocus(bar.root)
        return true
      }}
      onLeft={() => {
        if (cfg().left) focusNav()
        else go(-1)
        return true
      }}
      onRight={() => {
        go(1)
        return true
      }}
      onEnter={() => {
        const it = (props.items || [])[cur()]
        if (!it) return true
        trailer.stop()
        if (props.onBarInfo) props.onBarInfo(it)
        return true
      }}
    >
      <view
        width={1920}
        height={1080}
        transition={tx({ alpha: active() ? { duration: 250, easing: 'ease' } : { duration: 800, easing: 'ease-in-out' } })}
        alpha={active() ? 0 : 1}
      >
        <view width={1920} height={1080} src={backdrop() || undefined} textureOptions={COVER} />
      </view>
      <view width={1} height={1} alpha={0.001} src={pending()} onEvent={{ loaded: pendingLoaded, failed: pendingLoaded }} />

      <view>
        <Index each={arrows()}>
          {(a) => (
            <CarouselArrow
              ax={a().x}
              ay={a().y}
              icon={a().icon}
              frost={frost()}
              ink={cfg().arrowInk}
              radius={cfg().arrowRadius}
              onPointerClick={() => {
                pointerFocus(bar.root)
                go(a().icon === 'chevron_left' ? -1 : 1)
              }}
            />
          )}
        </Index>
      </view>

      <view
        x={logoX()}
        y={logoY()}
        width={logoNat().w}
        height={logoNat().h}
        src={logoSrc() || undefined}
        alpha={logoShown() ? 1 : 0.001}
        onEvent={{
          // The logo shrinks to fit and never grows.
          loaded: (_, e) => {
            const d = e && e.dimensions
            if (!d || !d.w || !d.h) return
            const s = Math.min(1, LOGO_W / d.w, LOGO_H / d.h)
            setLogoNat({ src: untrack(logoSrc), w: d.w * s, h: d.h * s })
          },
          failed: () => setBrokenLogo(untrack(item).Id),
        }}
      />
      <text
        x={logoX()}
        y={logoY() + SHIFT.title}
        fontFamily={(sdfTitle() && cfg().titleFont) || fontFor(titleText(), 'bold')}
        fontSize={41}
        lineHeight={43.05}
        letterSpacing={cfg().titleSpacing}
        maxWidth={406}
        maxLines={2}
        color={cfg().titleInk}
        textShadow={cfg().titleShadow}
        onEvent={{ loaded: (_, e) => e && e.dimensions && e.dimensions.h && setTitleH(e.dimensions.h) }}
      >
        {breakable(titleText())}
      </text>
      <NewReleaseLabel x={logoX()} y={releaseY()} kind={rel().kind} season={rel().season} episode={rel().episode} tagline={rel().tagline} />

      <view transition={tx({ x: boxT(), y: boxT() })} x={side()} y={boxY()}>
        <view
          transition={tx(sized())}
          width={boxW()}
          height={boxH()}
          borderRadius={cfg().radius}
          color="#00000000"
          shadow={cfg().glowB.shadow}
          alpha={!active() && cfg().glowB.on ? 1 : 0}
        />
        <view
          transition={tx(sized())}
          width={boxW()}
          height={boxH()}
          borderRadius={cfg().radius}
          color="#00000000"
          shadow={cfg().glowA.shadow}
          alpha={!active() && cfg().glowA.on ? 1 : 0}
        />
        <Frost img={frost()} sx={side()} sy={boxY()} fw={boxW()} fh={boxH()} radius={cfg().radius} ms={boxMs()} />
        <view
          transition={tx({ ...sized(), ...FADE })}
          width={boxW()}
          height={boxH()}
          borderRadius={cfg().radius}
          color={cfg().fill}
          alpha={active() ? 0 : 1}
        />
        <view transition={tx(sized())} width={boxW()} height={boxH()} borderRadius={cfg().radius} color="#00000000" border={cfg().border} />

        <view x={23 + edge()} y={edge() + pad()}>
          <view>
            <Index each={metaRow()}>
              {(m) => (
                <view
                  x={m().bx}
                  width={m().bw}
                  height={37}
                  borderRadius={4}
                  color="#00000000"
                  border={cfg().badgeBorder}
                  alpha={m().badge ? 1 : 0}
                />
              )}
            </Index>
          </view>
          <view>
            <Index each={metaRow()}>
              {(m) => (
                <text
                  x={m().x}
                  y={m().y}
                  fontFamily={m().font}
                  fontSize={m().size}
                  lineHeight={33}
                  letterSpacing={cfg().spacing}
                  color={cfg().text}
                  onEvent={{
                    loaded: (_, e) => {
                      const w = e && e.dimensions && e.dimensions.w
                      const text = untrack(m).text
                      if (w && untrack(metaW)[text] !== w) setMetaW({ ...untrack(metaW), [text]: w })
                    },
                  }}
                >
                  {m().text}
                </text>
              )}
            </Index>
          </view>
          <view>
            <Index each={metaRow()}>
              {(m) => (
                <text
                  x={m().sx}
                  y={metaH() / 2 - 16.5 + SHIFT.meta}
                  fontFamily={cfg().bold}
                  fontSize={17}
                  lineHeight={33}
                  letterSpacing={cfg().spacing}
                  color={cfg().sep}
                  onEvent={{
                    loaded: (_, e) => {
                      const w = e && e.dimensions && e.dimensions.w
                      if (w > 1 && w !== untrack(bulletW)) setBulletW(w)
                    },
                  }}
                >
                  {m().sep}
                </text>
              )}
            </Index>
          </view>
        </view>

        <view
          x={23 + edge()}
          y={edge() + 9 + pad() + metaH()}
          width={boxW() - 46 - edge() * 2}
          transition={tx({ height: boxT(), ...FADE })}
          height={detailsH()}
          clipping
          alpha={active() ? 0 : 1}
        >
          <view>
            <Show when={item().Id}>
              <RatingsRow
                item={item()}
                compact
                surface="mediaBar"
                pluginEnabled={cfg().mdb}
                maxW={boxW() - 46 - edge() * 2}
                onLayout={(box) => setRatingsH(box && !box.empty ? box.h : 0)}
              />
            </Show>
          </view>
          <text
            y={ratingsH() + 12 + SHIFT.overview}
            fontFamily={fontFor(overview())}
            fontSize={20}
            lineHeight={28}
            letterSpacing={cfg().spacing}
            maxWidth={boxW() - 46 - edge() * 2}
            maxLines={3}
            color={cfg().text}
            textShadow={OVERVIEW_SHADOW}
          >
            {breakable(overview())}
          </text>
        </view>
      </view>

      <view
        x={960 - dotsW() / 2}
        y={bannerH() - 44}
        width={dotsW()}
        height={32}
        borderRadius={cfg().pillRadius}
        color={cfg().pill}
        transition={FADE}
        alpha={count() > 1 && !active() ? 1 : 0}
      >
        {/* Neon Pulse's glow under the active dot. */}
        <view
          x={17 + cur() * 24}
          y={9}
          width={14}
          height={14}
          borderRadius={7}
          color="#00000000"
          shadow={cfg().dotGlow || GLOW_NONE}
          alpha={cfg().dotGlow ? 1 : 0}
        />
        <view>
          <Index each={dots()}>
            {(d, i) => (
              <view
                onPointerClick={() => {
                  pointerFocus(bar.root)
                  if (count() < 2 || i === cur()) return
                  setCur(i)
                  slideChanged()
                  restart()
                }}
                transition={DOT_MOVE}
                x={d().x}
                y={d().y}
                width={d().s}
                height={d().s}
                borderRadius={7}
                color={d().on ? cfg().dotOn : cfg().dot}
              />
            )}
          </Index>
        </view>
      </view>
    </view>
  )
}
