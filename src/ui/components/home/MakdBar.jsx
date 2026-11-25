import $L from '../../../services/i18n.js'
import { getRenderer } from '@solidtv/solid'
import { For, Index, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import NewReleaseLabel from './NewReleaseLabel.jsx'
import RatingsRow from './RatingsRow.jsx'
import { api } from '../../../services/jellyfinApi.js'
import { getApiForItem } from '../../../services/connectionPool.js'
import { isMdblistEnabled, isRatingSourceEnabled, ratingSettingsFor } from '../../../services/mdblistApi.js'
import { formatPlaybackEndsAt } from '../../../utils/playbackTimeLabels.js'
import { makdTint, resolveOverlayColor } from '../../../theme/overlayColors.js'
import * as settings from '../../../state/settings.js'
import { theme, navOnLeft } from '../../theme.js'
import { hex } from '../../color.js'
import { perfTier } from '../../tier.js'
import { focusNav } from '../../../app/focus.js'
import { backdropOf, breakable, loadReleases, logoOf, releaseOf, restartCarousel, stopCarousel } from './barKit.js'
import { trailerHost } from './trailerHost.js'
import { createBarContext } from './barContext.js'
import { face, facesReady, textWidth as faceWidth, themeFace } from './faces.js'
import { themeSpacing } from '../../text.js'
import { activeDotIndex, fitImage, flowWrap, makdOverlay } from './makdLayout.js'
import { pointerFocus } from '../../../app/pointer.js'

// The MakD media bar, after makd's Jellyfin Media Bar v6 Classic: the art fills the screen under a
// shade, a wash and a fade into the page, with the slide's details over Info, Play and Favorite
// bottom left. Left and Right walk the buttons and change the slide past either end. While a trailer
// shows, all of it fades out with focus kept on the buttons, and the first Left or Right ends it.

const GENRES = 3
const MAX_DOTS = 5
const INSET = 76.8
const RAIL = 78
const CONTENT_W = 883.2
const LOGO_H = 237.6
const MAX_H = 648
const ZOOM = 0.83
const LINE = 27
const SEP = 10
const PLAY_PAD = 12.6
const RING = 6
// The ratings row's room inside the info line, in its own unzoomed pixels.
const RATINGS_W = (CONTENT_W + 10 - 10 * ZOOM) / ZOOM
const ARCHIVO = ['archivo-narrow', 'archivo-narrow-medium', 'archivo-narrow-semibold', 'archivo-narrow-bold']
const EMPTY = {}
const FADE = { alpha: { duration: 250, easing: 'ease' } }

// List titles that aren't in the library open in Seerr and have nothing to play or favorite.
const isExternalItem = (item) => Boolean(item && (item._seerr || item._external) && !item._resolvedFromExternal)

const rgbOf = (c) => {
  const h = String(c).replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

const overlays = {}

// The shade, the wash and their fade into the page as one picture over the art, drawn once per color.
// The pixels go up as they are: encoding them as a PNG held the main thread for half a second, right
// as the bar's titles came in.
const overlayOf = (tint, opacity, page) => {
  const key = tint + '|' + opacity + '|' + page
  if (overlays[key] !== undefined) return overlays[key]
  let tex = null
  try {
    const img = document.createElement('canvas').getContext('2d').createImageData(480, 270)
    makdOverlay(img.data, 480, 270, rgbOf(tint), opacity, rgbOf(page))
    tex = getRenderer().stage.txManager.createTexture('ImageTexture', { src: img })
  } catch (e) {
    tex = null
  }
  overlays[key] = tex
  return tex
}

// One slide's art, driven through its handle (props.ref) since each slide restarts the same
// animations once the picture has loaded.
function MakdLayer(props) {
  let outer
  let art
  let src = ''
  let ready = ''
  let kb = false
  let settled = null
  const start = () => {
    outer.animate({ alpha: 1 }, { duration: 500, easing: 'ease-in-out' }).start()
    art.animate({ alpha: 1 }, { duration: 1200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).start()
    if (kb) art.animate({ scale: 1.1 }, { duration: 12000, easing: 'ease-out' }).start()
    clearTimeout(settled)
    settled = setTimeout(() => props.onSettled && props.onSettled(props.which), 1250)
  }
  const handle = {
    // A node at 0 is never drawn, so the renderer would never load its picture. 0.001 shows nothing.
    play(next, zoom) {
      kb = zoom
      outer.alpha = 0.001
      art.alpha = 0.7
      art.scale = 1
      if (src === next && ready === next) start()
      else {
        src = next
        art.src = next
      }
    },
    hide() {
      outer.alpha = 0
    },
  }
  // Handed over now: the bar's first slide plays before this layer's own onMount would run.
  if (props.ref) props.ref(handle)
  onCleanup(() => clearTimeout(settled))
  return (
    <view ref={outer} width={1920} height={1080} alpha={0.001} zIndex={props.zIndex}>
      <view
        ref={art}
        width={1920}
        height={1080}
        alpha={0.7}
        textureOptions={{ resizeMode: { type: 'cover', clipX: 0.5, clipY: 0.2 } }}
        onEvent={{
          loaded: () => {
            ready = src
            start()
          },
        }}
      />
    </view>
  )
}

export default function MakdBar(props) {
  const [cur, setCur] = createSignal(0)
  const [btn, setBtn] = createSignal('info')
  const [focused, setFocused] = createSignal(false)
  const [top, setTop] = createSignal('a')
  const [favorites, setFavorites] = createSignal({})
  const [ratings, setRatings] = createSignal({ w: 0, h: 0, empty: true })
  const [releaseH, setReleaseH] = createSignal(0)
  const [plotH, setPlotH] = createSignal(LINE)
  const [logoNat, setLogoNat] = createSignal({ src: '', w: 0, h: 0 })
  const [brokenLogo, setBrokenLogo] = createSignal('')
  const [fontsIn, setFontsIn] = createSignal(0)
  let slide
  let logoFade
  const layers = {}
  let held = false

  const { bar, relVer, holding, active } = createBarContext(props)

  const cfg = createMemo(() => {
    const s = settings.all()
    const t = theme()
    const opacity = (s.mediaBarOverlayOpacity == null ? 50 : s.mediaBarOverlayOpacity) / 100
    return {
      s,
      // Reel and Mosaic sidebars move the bar over only as far as the rail does.
      left: navOnLeft(s),
      hideDesc: s.hideHomeMediaDescription === true,
      mdb: isMdblistEnabled(s, 'mediaBar'),
      stars: isRatingSourceEnabled(ratingSettingsFor(s, 'mediaBar'), 'stars'),
      overlay: overlayOf(makdTint(resolveOverlayColor(s.mediaBarOverlayColor)), opacity, t.background),
    }
  })
  const count = () => (props.items || []).length
  const item = createMemo(() => (props.items || [])[cur()] || EMPTY)
  const external = () => isExternalItem(item())
  const order = () => (external() ? ['info'] : ['info', 'play', 'favorite'])
  const focusId = () => {
    if (!focused()) return ''
    return order().indexOf(btn()) >= 0 ? btn() : 'info'
  }
  const isFav = () => {
    const it = item()
    if (!it.Id) return false
    const saved = favorites()[it.Id]
    return saved !== undefined ? saved : Boolean(it.UserData && it.UserData.IsFavorite)
  }
  const barH = () => 1080 - (props.rowPeek || 0)
  const left = () => INSET + (cfg().left ? RAIL : 0)
  const logoSrc = createMemo(() => {
    const it = item()
    return it.Id && it.Id !== brokenLogo() ? logoOf(it) : ''
  })
  const title = () => (logoSrc() ? '' : item().Name || '')
  const rel = createMemo(() => {
    relVer()
    return releaseOf(bar, item().Id)
  })
  const release = () => (rel().kind ? rel() : null)
  const plot = () => (cfg().hideDesc ? '' : item().Overview || '')

  // The theme's letter spacing (Neon Pulse's 0.6px) widens the bar's text too.
  const textWidth = (t, size, f) => faceWidth(t, size, f) + (themeFace(f) ? 0 : themeSpacing() * String(t).length)
  const fields = createMemo(() => {
    const it = item()
    const c = cfg()
    if (!it.Id) return []
    fontsIn()
    const out = []
    const text = (k, t) => {
      const f = face('archivo', 500, t)
      out.push({ k, kind: 'text', t, f, w: textWidth(t, 20, f), h: LINE })
    }
    if (c.mdb) {
      // The plugin's row keeps its place even with nothing in it.
      const r = ratings()
      const m = 5 * ZOOM
      out.push({ k: 'ratings', kind: 'ratings', w: r.empty ? 0 : r.w, h: r.empty ? 0 : r.h, ml: m, mr: m, mb: 6 * ZOOM })
    } else {
      if (it.CommunityRating && c.stars) {
        const t = it.CommunityRating.toFixed(1)
        const f = face('archivo', 500, t)
        out.push({ k: 'stars', kind: 'stars', t, f, w: 31.5 + textWidth(t, 20, f), h: 28 })
      }
      if (it.CriticRating != null) {
        const t = `${Math.round(it.CriticRating)}%`
        const f = face('archivo', 500, t)
        const fresh = it.CriticRating >= 60
        const src = `icons/ratings/rt-fallback-${fresh ? 'fresh' : 'rotten'}.webp`
        out.push({ k: 'critic', kind: 'critic', t, f, w: 23 + textWidth(t, 20, f), h: LINE, src, ratio: fresh ? 0.9823 : 1.0357 })
      }
    }
    const year = it.ProductionYear || (it.PremiereDate ? new Date(it.PremiereDate).getFullYear() : null)
    if (year) text('year', String(year))
    if (it.OfficialRating) {
      const t = it.OfficialRating
      const f = face('archivo', 600, t)
      out.push({ k: 'age', kind: 'age', t, f, w: textWidth(t, 20, f) + 20, h: LINE })
    }
    if (it.ChildCount) {
      text('runtime', it.ChildCount === 1 ? $L('1 Season') : $L('{count} Seasons').replace('{count}', it.ChildCount))
    } else if (it.Type !== 'Series' && it.RunTimeTicks > 0) {
      const ends = formatPlaybackEndsAt(it.RunTimeTicks / 10000000, c.s.clockDisplay, c.s.timeOffsetHours)
      if (ends) text('runtime', ends)
    }
    return out
  })
  const genreList = createMemo(() => {
    fontsIn()
    return (item().Genres || []).slice(0, GENRES).map((g, i) => {
      const f = face('archivo', 400, g)
      return { k: 'g' + i, kind: 'text', t: g, f, w: textWidth(g, 20, f), h: LINE }
    })
  })
  const playLabel = $L('Play')
  const playFont = face('archivo', 700, playLabel)
  const playW = createMemo(() => {
    fontsIn()
    return PLAY_PAD * 2 + 22 + 6 + textWidth(playLabel, 18, playFont)
  })
  // Everything placed, from the buttons up, since the content sits on the bar's bottom edge.
  const lay = createMemo(() => {
    const L = left()
    const btnY = barH() - 85
    const withSeps = (list) => {
      const out = []
      list.forEach((it, i) => {
        if (i) out.push({ k: 'sep' + i, kind: 'sep', w: SEP, h: SEP })
        out.push(it)
      })
      return out
    }
    const info = fields().length ? flowWrap(withSeps(fields()), CONTENT_W, 10, 6) : null
    const genres = genreList().length ? flowWrap(withSeps(genreList()), CONTENT_W, 5, 6) : null
    const pH = plot() ? plotH() : 0
    const labelH = release() ? releaseH() : 0
    // The logo's box is the one part that gives way when the slide would pass 60% of the screen.
    const below = 8 + (labelH ? 13 + labelH : 0) + (info ? info.h : 0) + (genres ? genres.h : 0) + (pH ? 18 + pH : 0)
    const logoBox = Math.max(0, Math.min(LOGO_H, MAX_H - below - 26 - 50))
    let y = btnY - 26
    const plotY = y - pH
    if (pH) y = plotY - 18
    const genresY = genres ? y - genres.h : y
    y = genresY
    const infoY = info ? y - info.h : y
    y = infoY
    const labelY = labelH ? y - labelH : y
    if (labelH) y = labelY - 13
    const logoBottom = y - 8

    const texts = []
    const seps = []
    const marks = []
    const badges = []
    let ratingsAt = { x: L, y: infoY }
    const place = (flow, topY, k) =>
      flow.items.forEach((p) => {
        const x = L + p.x
        const py = topY + p.y
        if (p.kind === 'sep') seps.push({ k: k + p.k, x: x + 5 - 10 / 3, y: py + 5 - 10 / 3 })
        else if (p.kind === 'ratings') ratingsAt = { x, y: py }
        else if (p.kind === 'stars') {
          marks.push({ k: 'stars', x, y: py, w: 28, h: 28, src: 'icons/star.webp', c: '#f2b01eff' })
          texts.push({ k: k + p.k, x: x + 31.5, y: py + 0.5, t: p.t, f: p.f, c: '#ffffffff' })
        } else if (p.kind === 'critic') {
          const w = p.ratio > 1 ? 18 : 18 * p.ratio
          const h = p.ratio > 1 ? 18 / p.ratio : 18
          marks.push({ k: 'critic', x: x + (18 - w) / 2, y: py + 4.5 + (18 - h) / 2, w, h, src: p.src, c: '#ffffffff' })
          texts.push({ k: k + p.k, x: x + 23, y: py, t: p.t, f: p.f, c: '#ffffffff' })
        } else if (p.kind === 'age') {
          badges.push({ k: 'age', x, y: py, w: p.w, h: LINE })
          texts.push({ k: k + p.k, x: x + 10, y: py, t: p.t, f: p.f, c: '#000000ff' })
        } else texts.push({ k: k + p.k, x, y: py, t: p.t, f: p.f, c: '#ffffffff' })
      })
    if (info) place(info, infoY, 'i')
    if (genres) place(genres, genresY, 'g')

    const playX = L + 65
    const favX = playX + playW() + 15
    const ring = (k, x, w, r) => ({ k, x: x - RING, y: btnY - RING, w: w + RING * 2, h: 50 + RING * 2, r })
    const rings = [ring('info', L, 50, 31)]
    if (!external()) rings.push(ring('play', playX, playW(), 14), ring('favorite', favX, 50, 31))
    return { L, btnY, plotY, labelY, logoBottom, logoBox, ratingsAt, texts, seps, marks, badges, playX, favX, rings }
  })
  const logo = createMemo(() => {
    const n = logoNat()
    const shown = !!n.src && n.src === logoSrc()
    const size = fitImage(shown ? n.w : 0, shown ? n.h : 0, CONTENT_W, lay().logoBox)
    return { w: size.w || 1, h: size.h || 1, y: lay().logoBottom - size.h, a: shown ? 1 : 0.001 }
  })
  const dots = createMemo(() => {
    const n = Math.min(count(), MAX_DOTS)
    if (n < 2) return []
    const on = activeDotIndex(cur(), count())
    const right = 1920 - 57.6
    const out = []
    for (let i = 0; i < n; i++) out.push({ k: i, x: right - (n - i) * 20 + 5, on: i === on })
    return out
  })
  const arrowsOn = () => count() > 1 && focused() && !active()

  // Each slide's text fades in afresh and its logo settles.
  const slideChanged = () => {
    const it = item()
    const slot = top() === 'a' ? 'b' : 'a'
    const layer = layers[slot]
    if (layer) layer.play(backdropOf(it, { maxWidth: 1920, quality: 85 }), perfTier() === 'high')
    setTop(slot)
    if (slide) {
      slide.alpha = 0
      slide.animate({ alpha: 1 }, { duration: 500, easing: 'ease-in-out' }).start()
    }
    if (logoFade) {
      logoFade.alpha = 0.7
      logoFade.animate({ alpha: 1 }, { duration: 1200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).start()
    }
    if (props.onBarSlide) props.onBarSlide(it)
    if (trailer) trailer.sync()
  }
  // Play and Favorite go away on a list title, so focus moves to Info first.
  const goTo = (i) => {
    const it = (props.items || [])[i]
    if (!it) return
    if (isExternalItem(it)) setBtn('info')
    setCur(i)
    slideChanged()
  }
  const restart = () => restartCarousel(bar, () => goTo((cur() + 1) % count()))
  const step = (delta) => {
    if (count() <= 1) return
    goTo((cur() + delta + count()) % count())
    restart()
  }
  // The art underneath is covered once the new one has settled, so it stops costing a draw.
  const onLayerSettled = (slot) => {
    if (slot !== top()) return
    const under = layers[slot === 'a' ? 'b' : 'a']
    if (under) under.hide()
  }
  const toggleFavorite = () => {
    const it = item()
    if (!it.Id) return
    const id = it.Id
    const next = !isFav()
    setFavorites({ ...favorites(), [id]: next })
    ;(getApiForItem(it) || api).setFavorite(id, next).catch(() => {
      setFavorites({ ...favorites(), [id]: !next })
    })
  }

  const trailer = trailerHost(bar, {
    current: () => (item().Id ? item() : null),
    hidesChrome: true,
    // A trailer outlives the carousel interval, so finishing one moves the slide on itself.
    onEnded: () => {
      if (count() > 1) goTo((cur() + 1) % count())
    },
  })

  createEffect(
    on(
      () => props.items,
      () => {
        setBrokenLogo('')
        loadReleases(bar)
        goTo(0)
        if (bar._focused) restart()
      },
    ),
  )
  onMount(() => {
    facesReady(ARCHIVO).then(() => setFontsIn(fontsIn() + 1))
  })
  createEffect(on(holding, restart, { defer: true }))
  onCleanup(() => {
    stopCarousel(bar)
    trailer.destroy()
  })

  const onFocusChanged = (has) => {
    bar._focused = has
    setFocused(has)
    if (has) {
      setBtn('info')
      restart()
    } else stopCarousel(bar)
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
      // A click on the banner opens its title (app/pointer.js). The bar spans the screen under
      // Home's rows, so hovering it doesn't take focus from them.
      onPointerClick={(n) => {
        pointerFocus(n)
        return true
      }}
      onFocusChanged={onFocusChanged}
      onLeft={() => {
        // Over a full screen trailer the first press ends it and brings the bar back.
        if (active()) {
          trailer.dismiss()
          return true
        }
        const at = order().indexOf(focusId())
        if (at > 0) setBtn(order()[at - 1])
        else if (navOnLeft()) focusNav()
        else step(-1)
        return true
      }}
      onRight={() => {
        if (active()) {
          trailer.dismiss()
          return true
        }
        const at = order().indexOf(focusId())
        if (at >= 0 && at < order().length - 1) setBtn(order()[at + 1])
        else step(1)
        return true
      }}
      onEnter={(e) => {
        // A held OK would press the button again on every repeat.
        if ((e && e.repeat) || held) return true
        held = true
        const it = item()
        const id = focusId()
        if (id === 'favorite') toggleFavorite()
        else if (it.Id) {
          trailer.stop()
          if (id === 'play' && props.onBarPlay) props.onBarPlay(it)
          else if (props.onBarInfo) props.onBarInfo(it)
        }
        return true
      }}
      onEnterRelease={() => {
        held = false
      }}
    >
      <view width={1920} height={1080} transition={FADE} alpha={active() ? 0 : 1}>
        <MakdLayer ref={(h) => (layers.a = h)} which="a" zIndex={top() === 'a' ? 2 : 1} onSettled={onLayerSettled} />
        <MakdLayer ref={(h) => (layers.b = h)} which="b" zIndex={top() === 'b' ? 2 : 1} onSettled={onLayerSettled} />
        <view width={1920} height={1080} texture={cfg().overlay} color="#ffffffff" alpha={cfg().overlay ? 1 : 0} zIndex={3} />
      </view>

      <view transition={FADE} alpha={active() ? 0 : 1}>
        <view ref={slide}>
          <view ref={logoFade}>
            <view
              x={lay().L}
              y={logo().y}
              width={logo().w}
              height={logo().h}
              src={logoSrc() || undefined}
              alpha={logo().a}
              onEvent={{
                loaded: (_, e) => {
                  const d = e && e.dimensions
                  if (d && d.w && d.h) setLogoNat({ src: untrack(logoSrc), w: d.w, h: d.h })
                },
                failed: () => setBrokenLogo(untrack(item).Id),
              }}
            />
          </view>
          <text
            x={lay().L}
            y={lay().logoBottom}
            mountY={1}
            fontFamily={face('noto', 400, title())}
            fontSize={80}
            letterSpacing={themeSpacing()}
            lineHeight={88}
            maxWidth={883.2}
            maxLines={2}
            color="#ffffffff"
          >
            {breakable(title())}
          </text>
          <NewReleaseLabel
            x={lay().L}
            y={lay().labelY}
            kind={rel().kind}
            season={rel().season}
            episode={rel().episode}
            tagline={rel().tagline}
            onSize={setReleaseH}
          />
          <view>
            <Show when={cfg().mdb && item().Id}>
              <RatingsRow
                x={lay().ratingsAt.x}
                y={lay().ratingsAt.y}
                item={item()}
                compact
                surface="mediaBar"
                labels={false}
                badges={false}
                font="archivo"
                maxW={RATINGS_W}
                zoom={0.83}
                onLayout={setRatings}
              />
            </Show>
          </view>
          <view>
            <For each={lay().badges}>{(b) => <view x={b.x} y={b.y} width={b.w} height={b.h} borderRadius={5} color="#ffffffcc" />}</For>
          </view>
          <view>
            <For each={lay().marks}>{(m) => <view x={m.x} y={m.y} width={m.w} height={m.h} src={m.src} color={m.c} />}</For>
          </view>
          <view>
            <For each={lay().seps}>{(d) => <view x={d.x} y={d.y} width={6.67} height={6.67} borderRadius={3.33} color="#ffffff8c" />}</For>
          </view>
          <view>
            <For each={lay().texts}>
              {(t) => (
                <text x={t.x} y={t.y} fontFamily={t.f} fontSize={20} lineHeight={27} letterSpacing={themeSpacing()} color={t.c}>
                  {t.t}
                </text>
              )}
            </For>
          </view>
          <text
            x={lay().L}
            y={lay().plotY}
            fontFamily={face('noto', 400, plot())}
            fontSize={20}
            letterSpacing={themeSpacing()}
            lineHeight={27}
            maxWidth={883.2}
            maxLines={3}
            color="#ffffffff"
            onEvent={{ loaded: (_, e) => e && e.dimensions && e.dimensions.h && setPlotH(e.dimensions.h) }}
          >
            {breakable(plot())}
          </text>
        </view>

        <view
          x={lay().L}
          y={lay().btnY}
          width={50}
          height={50}
          borderRadius={25}
          color="#00000073"
          border={{ width: 1, color: hex('#ffffff59') }}
        >
          <view x={14} y={14} width={22} height={22} src="icons/infoOutline.webp" color="#ffffffff" />
        </view>
        <view x={lay().playX} y={lay().btnY} width={playW()} height={50} borderRadius={8} color="#ffffffff" alpha={external() ? 0 : 1}>
          <view x={12.6} y={14} width={22} height={22} src="icons/play_arrow.webp" color="#000000ff" />
          <text x={40.6} y={16} fontFamily={playFont} fontSize={18} lineHeight={18} letterSpacing={themeSpacing()} color="#000000ff">
            {playLabel}
          </text>
        </view>
        <view
          x={lay().favX}
          y={lay().btnY}
          width={50}
          height={50}
          borderRadius={25}
          color="#00000073"
          border={{ width: 1, color: hex(isFav() ? '#ff4d4d99' : '#ffffff59') }}
          alpha={external() ? 0 : 1}
        >
          <view
            x={14}
            y={14}
            width={22}
            height={22}
            src={isFav() ? 'icons/favorite.webp' : 'icons/favorite_border.webp'}
            color={isFav() ? '#ff4d4dff' : '#ffffffff'}
          />
        </view>
        <view>
          <For each={lay().rings}>
            {(r) => (
              <view
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                borderRadius={r.r}
                color="#00000000"
                border={{ width: 3, color: 0xffffffff }}
                alpha={r.k === focusId() ? 1 : 0}
              />
            )}
          </For>
        </view>
      </view>

      <view transition={FADE} alpha={active() ? 0 : 1}>
        {/* By position, so a dot that stays eases between on and off. */}
        <Index each={dots()}>
          {(d) => (
            <view
              x={d().x}
              y={barH() - 45}
              width={10}
              height={10}
              borderRadius={5}
              color={d().on ? '#ffffffff' : '#cecece99'}
              scale={d().on ? 1.7 : 1}
              transition={{
                color: { duration: 500, easing: 'ease-in-out' },
                scale: { duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
              }}
            />
          )}
        </Index>
      </view>

      <view transition={FADE} alpha={arrowsOn() ? 1 : 0}>
        <view x={1688.2} y={505} width={70} height={70} borderRadius={35} color="#0a0c126b" border={{ width: 1, color: hex('#ffffff47') }}>
          <view x={15} y={15} width={40} height={40} src="icons/chevron_left.webp" color="#ffffffff" />
        </view>
        <view x={1773.2} y={505} width={70} height={70} borderRadius={35} color="#0a0c126b" border={{ width: 1, color: hex('#ffffff47') }}>
          <view x={15} y={15} width={40} height={40} src="icons/chevron_right.webp" color="#ffffffff" />
        </view>
      </view>
    </view>
  )
}
