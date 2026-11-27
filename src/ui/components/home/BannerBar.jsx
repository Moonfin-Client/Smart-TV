import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js'
import NewReleaseLabel from './NewReleaseLabel.jsx'
import RatingsRow from './RatingsRow.jsx'
import { cssShift, fontFor, themeSpacing } from '../../text.js'
import { theme, navOnLeft } from '../../theme.js'
import { perfTier } from '../../tier.js'
import { formatDuration } from '../../../utils/helpers.js'
import { seerrThumbUrl } from '../../../utils/tmdbThumb.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import * as settings from '../../../state/settings.js'
import { focusNav } from '../../../app/focus.js'
import { createBarContext } from './barContext.js'
import { roundedZoom } from './zoomShader.js'
import { backdropOf, glowOf, imageOf, logoOf, loadReleases, releaseOf, restartCarousel, stopCarousel, toNum } from './barKit.js'
import { pointerFocus } from '../../../app/pointer.js'

// The Banner media bar: a card across the top with Home's rows under it. The slide's banner art
// shows whole over a blurred copy of itself, or else its backdrop with the logo or title over it.
// Trailers don't play here.

const CARD_H = 543
const MAX_DOTS = 7
const LOGO_W = 400
const LOGO_H = 93
const TITLE_LH = 48.3
const META_LH = 33
const EMPTY = {}
const SHIFT = { title: cssShift(46), meta: cssShift(20) }
const COVER = { resizeMode: { type: 'cover' } }
const RING_FADE = { alpha: { duration: 180, easing: 'ease' } }
const DOT_T = { duration: 250, easing: 'ease' }
const TITLE_SHADOW = { color: '#000000cc', x: 0, y: 2, blur: 12 }
const META_SHADOW = { color: '#000000cc', x: 0, y: 1, blur: 8 }

const bannerUrlOf = (item) => {
  if (item._external) return seerrThumbUrl(item) || ''
  return item.ImageTags && item.ImageTags.Banner ? imageOf(item, 'Banner', { maxWidth: 1280, tag: item.ImageTags.Banner }) : ''
}

const metaOf = (item) => {
  const parts = []
  if (item.ProductionYear) parts.push(String(item.ProductionYear))
  if (item.Type !== 'Series' && item.RunTimeTicks) {
    const dur = formatDuration(item.RunTimeTicks)
    if (dur && dur !== '0m') parts.push(dur)
  }
  if (item.OfficialRating) parts.push(item.OfficialRating)
  return parts.join('  ·  ')
}

export default function BannerBar(props) {
  const { bar, relVer } = createBarContext(props)
  const [cur, setCur] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const [failedBanner, setFailedBanner] = createSignal('')
  const [art, setArt] = createSignal(null)
  const [logo, setLogo] = createSignal(null)
  const [labelH, setLabelH] = createSignal(0)
  const [ratingsH, setRatingsH] = createSignal(0)

  const cfg = createMemo(() => {
    const s = settings.all()
    const t = theme()
    const glow = t.focusGlow.length ? t.focusGlow : [{ color: t.accentA(0.4), x: 0, y: 0, blur: 30, spread: 0 }]
    return {
      left: navOnLeft(s),
      mdb: isMdblistEnabled(s, 'mediaBar'),
      ring: { width: 4, color: toNum(t.focus) },
      glowA: glowOf(glow[0]),
      glowB: glowOf(glow[1]),
      shadeL: t.scrim.slice(0, 7) + 'e6',
      shadeR: t.scrim.slice(0, 7) + '00',
      onBg: t.onBackground,
      meta: t.os(0.75),
      dot: t.os(0.4),
      // The blur roughly doubles the slowest paint of a slide change on a weaker TV, so the
      // slowest tier leaves the blurred copy out.
      blur: perfTier() !== 'low',
      spacing: themeSpacing(),
      // The pixel theme squares the card.
      radius: t.isPixel ? 0 : 27,
      inner: t.isPixel ? 0 : 23,
    }
  })
  const count = () => (props.items || []).length
  const item = createMemo(() => (props.items || [])[cur()] || EMPTY)
  const card = createMemo(() => {
    const x = cfg().left ? 134 : 40
    return { x, w: 1920 - x - 40 }
  })
  // The padding box inside the 4px border, where the art and the content sit.
  const inner = createMemo(() => ({ w: card().w - 8, h: CARD_H - 8 }))
  const banner = createMemo(() => {
    const it = item()
    if (!it.Id || failedBanner() === it.Id) return ''
    return bannerUrlOf(it)
  })
  const backdrop = () => (banner() ? '' : backdropOf(item(), { maxWidth: 1920, quality: 85 }))
  // The server blurs the copy that fills around the art.
  const fill = () => {
    if (!banner() || !cfg().blur) return ''
    return /\/Images\/Banner/.test(banner()) ? banner() + '&blur=16' : banner()
  }
  // The art is contained and centered.
  const artBox = createMemo(() => {
    const a = art()
    const { w, h } = inner()
    if (!a || a.src !== banner()) return { x: 0, y: 0, w, h, shown: false }
    const s = Math.min(w / a.w, h / a.h)
    return { x: (w - a.w * s) / 2, y: (h - a.h * s) / 2, w: a.w * s, h: a.h * s, shown: true }
  })
  const logoSrc = () => (banner() ? '' : logoOf(item()))
  const logoBox = createMemo(() => {
    const l = logo()
    if (!l || l.src !== logoSrc()) return { w: LOGO_W, h: LOGO_H, y: 0, shown: false }
    const s = Math.min(LOGO_W / l.w, LOGO_H / l.h)
    return { w: l.w * s, h: l.h * s, y: (LOGO_H - l.h * s) / 2, shown: true }
  })
  const title = () => (banner() || logoSrc() ? '' : item().Name || '')
  const meta = () => metaOf(item())
  const rel = createMemo(() => {
    relVer()
    return releaseOf(bar, item().Id)
  })
  // The content stacks up from the bottom: the ratings, the meta line, the release label, then the
  // logo or title.
  const stack = createMemo(() => {
    let y = inner().h - 23
    const ratingsY = y - ratingsH()
    y = ratingsY
    let metaY = y
    if (meta()) {
      metaY = y - 5 - META_LH
      y = metaY - 10
    }
    let labelY = y
    if (labelH()) {
      labelY = y - labelH()
      y = labelY - 13
    }
    const headY = y - (logoSrc() ? LOGO_H : title() ? TITLE_LH : 0)
    return { ratingsY, metaY, labelY, headY }
  })
  const dots = createMemo(() => {
    const n = count()
    if (n < 2) return { keys: [], map: {} }
    const shown = Math.min(n, MAX_DOTS)
    const start = Math.max(0, Math.min(cur() - Math.floor(shown / 2), n - shown))
    let total = 7 * (shown - 1)
    for (let i = 0; i < shown; i++) total += start + i === cur() ? 27 : 10
    let x = inner().w - 30 - total
    const keys = []
    const map = {}
    for (let i = 0; i < shown; i++) {
      const on = start + i === cur()
      const k = String(start + i)
      keys.push(k)
      map[k] = { x, w: on ? 27 : 10, on }
      x += (on ? 27 : 10) + 7
    }
    return { keys, map }
  })

  const slideChanged = () => {
    const it = (props.items || [])[untrack(cur)]
    if (it && props.onBarSlide) props.onBarSlide(it)
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

  createEffect(
    on(
      () => props.items,
      () => {
        setCur(0)
        loadReleases(bar)
        slideChanged()
        if (bar._focused) restart()
      },
    ),
  )
  onCleanup(() => stopCarousel(bar))

  const onFocusChanged = (has) => {
    bar._focused = has
    setFocused(has)
    if (has) restart()
    else stopCarousel(bar)
  }

  return (
    <view
      ref={(n) => {
        bar.root = n
        if (props.ref) props.ref(n)
      }}
      x={card().x}
      width={card().w}
      height={CARD_H}
      alpha={props.alpha === undefined ? 1 : props.alpha}
      // A click on the banner opens its title (app/pointer.js). The bar spans the screen under
      // Home's rows, so hovering it doesn't take focus from them.
      onPointerClick={(n) => {
        pointerFocus(n)
        return true
      }}
      onFocusChanged={onFocusChanged}
      onLeft={() => {
        if (cfg().left && cur() === 0) focusNav()
        else go(-1)
        return true
      }}
      onRight={() => {
        go(1)
        return true
      }}
      onEnter={() => {
        const it = (props.items || [])[cur()]
        if (it && props.onBarInfo) props.onBarInfo(it)
        return true
      }}
    >
      <view transition={RING_FADE} alpha={focused() ? 1 : 0}>
        <view
          width={card().w}
          height={CARD_H}
          borderRadius={cfg().radius}
          color="#00000000"
          shadow={cfg().glowB.shadow}
          alpha={cfg().glowB.on ? 1 : 0}
        />
        <view width={card().w} height={CARD_H} borderRadius={cfg().radius} color="#00000000" shadow={cfg().glowA.shadow} />
      </view>

      <view x={4} y={4} width={inner().w} height={inner().h} clipping>
        <view width={inner().w} height={inner().h} src={backdrop() || undefined} textureOptions={COVER} borderRadius={cfg().inner} />
        {/* The blurred copy fills the card at 110 percent, inside the card's rounded corners. */}
        <view width={inner().w} height={inner().h} src={fill() || undefined} textureOptions={COVER} shader={[roundedZoom(), { radius: cfg().inner, zoom: 1.1 }]} />
        <view
          x={artBox().x}
          y={artBox().y}
          width={artBox().w}
          height={artBox().h}
          src={banner() || undefined}
          alpha={artBox().shown ? 1 : 0.001}
          onEvent={{
            loaded: (node, e) => {
              const d = e && e.dimensions
              if (d && d.w && d.h) setArt({ src: untrack(banner), w: d.w, h: d.h })
            },
            // Art that won't load falls back to the backdrop, with the title back over it.
            failed: () => setFailedBanner(untrack(item).Id),
          }}
        />
        <view width={inner().w} height={inner().h} borderRadius={cfg().inner} colorLeft={cfg().shadeL} colorRight={cfg().shadeR} />

        <view x={33}>
          <view
            y={stack().headY + logoBox().y}
            width={logoBox().w}
            height={logoBox().h}
            src={logoSrc() || undefined}
            alpha={logoBox().shown ? 1 : 0.001}
            onEvent={{
              loaded: (_, e) => {
                const d = e && e.dimensions
                if (d && d.w && d.h) setLogo({ src: untrack(logoSrc), w: d.w, h: d.h })
              },
            }}
          />
          <text
            y={stack().headY + SHIFT.title}
            fontFamily={fontFor(title(), 'bold')}
            fontSize={46}
            lineHeight={48.3}
            letterSpacing={cfg().spacing}
            maxWidth={inner().w - 66}
            maxLines={1}
            color={cfg().onBg}
            textShadow={TITLE_SHADOW}
          >
            {title()}
          </text>
          <NewReleaseLabel
            y={stack().labelY}
            kind={rel().kind}
            season={rel().season}
            episode={rel().episode}
            tagline={rel().tagline}
            onSize={setLabelH}
          />
          <text
            y={stack().metaY + SHIFT.meta}
            fontFamily={fontFor(meta(), 'bold')}
            fontSize={20}
            lineHeight={33}
            letterSpacing={cfg().spacing}
            color={cfg().meta}
            textShadow={META_SHADOW}
          >
            {meta()}
          </text>
          <view y={stack().ratingsY}>
            <Show when={item().Id}>
              <RatingsRow
                item={item()}
                compact
                labels={false}
                badges={false}
                surface="mediaBar"
                pluginEnabled={cfg().mdb}
                maxW={inner().w - 66}
                onLayout={(box) => setRatingsH(box && !box.empty ? box.h : 0)}
              />
            </Show>
          </view>
        </view>

        <view y={20}>
          {/* Keyed by slide, so a dot slides along with the window. */}
          <For each={dots().keys}>
            {(k) => {
              const d = () => dots().map[k] || EMPTY
              return (
                <view
                  transition={{ x: DOT_T, width: DOT_T }}
                  x={d().x}
                  width={d().w}
                  height={10}
                  borderRadius={5}
                  color={d().on ? cfg().onBg : cfg().dot}
                />
              )
            }}
          </For>
        </view>
      </view>

      <view
        width={card().w}
        height={CARD_H}
        borderRadius={cfg().radius}
        color="#00000000"
        border={cfg().ring}
        transition={RING_FADE}
        alpha={focused() ? 1 : 0}
      />
    </view>
  )
}
