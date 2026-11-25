import $L from '../../../services/i18n.js'
import { For, Index, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from 'solid-js'
import NewReleaseLabel from './NewReleaseLabel.jsx'
import RatingsRow from './RatingsRow.jsx'
import CarouselArrow, { arrowSpots } from './CarouselArrow.jsx'
import GalleryGround from './GalleryGround.jsx'
import { cssShift, fontFor, textReady, textWidth, themeSpacing, uiFont } from '../../text.js'
import { theme, navOnLeft } from '../../theme.js'
import { perfTier } from '../../tier.js'
import { formatDuration } from '../../../utils/helpers.js'
import { api } from '../../../services/jellyfinApi.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import * as settings from '../../../state/settings.js'
import { focusNav } from '../../../app/focus.js'
import { trailerHost } from './trailerHost.js'
import { createBarContext } from './barContext.js'
import { genreGlowRgb } from './galleryGlow.js'
import { onScreen } from './onScreen.js'
import { galleryPanels, wrapPills } from './barMath.js'
import { backdropOf, breakable, glowOf, shade, padIndex, loadReleases, releaseOf, restartCarousel, rgbA, stopCarousel } from './barKit.js'
import { pointerFocus } from '../../../app/pointer.js'

// The Gallery media bar: five slides at a time as tall panels on a glowing page. The active one opens
// up wide with its details and a credits card, and the rest stand as narrow strips with their number
// and a vertical title. A trailer plays inside the active panel and covers all of it.

const PAGE = 5
const GENRES = 3
const CAST = 5
const GROW = 16
const GAP = 6
const ROW_Y = 97.2
const DETAIL_DELAY = 350
// This renderer applies a rounded node's alpha once, as CSS does.
const IDLE_ALPHA = 0.35
const EMPTY = {}
const SHIFT = {
  index: cssShift(20),
  vtitle: cssShift(22),
  title: cssShift(52),
  pill: cssShift(18),
  overview: cssShift(22),
  label: cssShift(16),
  value: cssShift(20),
}
const COVER = { resizeMode: { type: 'cover' } }
const PANEL_T = { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
const NO_OUTLINE = { width: 0, color: 0 }
const SHADOWS = {
  index: { color: '#000000cc', x: 0, y: 1, blur: 6 },
  vtitle: { color: '#000000cc', x: 0, y: 0, blur: 6 },
  title: { color: '#000000b3', x: 0, y: 2, blur: 12 },
  overview: { color: '#000000b3', x: 0, y: 1, blur: 12 },
}

export default function GalleryBar(props) {
  const { bar, relVer, holding, active } = createBarContext(props)
  const [cur, setCur] = createSignal(0)
  const [detailId, setDetailId] = createSignal('')
  const [detailVer, setDetailVer] = createSignal(0)
  const [pulse, setPulse] = createSignal(false)
  const [titleH, setTitleH] = createSignal(53.04)
  const [overviewH, setOverviewH] = createSignal(0)
  const [labelH, setLabelH] = createSignal(0)
  const [ratingsH, setRatingsH] = createSignal(0)
  const [dirH, setDirH] = createSignal(33)
  const [castH, setCastH] = createSignal(33)
  const [facesIn, setFacesIn] = createSignal(0)
  let detailCache = {}
  let detailTimer = null
  let detailFor = ''
  let fadeNode
  let pulseTimer = null

  const cfg = createMemo(() => {
    const s = settings.all()
    const t = theme()
    const low = perfTier() === 'low'
    return {
      left: navOnLeft(s),
      hideDesc: s.hideHomeMediaDescription === true,
      mdb: isMdblistEnabled(s, 'mediaBar'),
      bg: t.background,
      onBg: t.onBackground,
      index: t.os(0.85),
      // The panel scrim has no theme color, so it stays black.
      scrim: '#000000ff',
      pill: t.scrim.slice(0, 7) + '59',
      outline: shade({ w: 1, color: t.os(0.55) }),
      overview: t.os(0.9),
      card: t.scrim.slice(0, 7) + '8c',
      cardBorder: shade({ w: 1, color: t.os(0.12) }),
      accent: t.accent,
      labelFont: uiFont('bold'),
      // The slowest tier holds the shimmer still, a little brighter.
      still: low,
      shimmer: t.os(low ? 0.14 : 0.1),
      arrowInk: t.onBackground,
      spacing: themeSpacing(),
      // The pixel theme squares the card and the pills.
      cardRadius: t.isPixel ? 0 : 18,
      pillRadius: t.isPixel ? 0 : 8,
    }
  })
  const count = () => (props.items || []).length
  const safe = () => Math.min(cur(), Math.max(0, count() - 1))
  const item = createMemo(() => (props.items || [])[safe()] || EMPTY)
  // The glow keeps the default tone whatever the genre, and the genre pills take the plain pill fill.
  const glow = genreGlowRgb(null)
  const rowX = () => (cfg().left ? 102 : 24)
  const rowW = () => 1920 - rowX() - 24
  const rowH = () => 1080 - (props.rowPeek || 0) - ROW_Y - 32.4
  const pageStart = () => Math.floor(safe() / PAGE) * PAGE
  const panels = createMemo(() => {
    const start = pageStart()
    const list = (props.items || []).slice(start, start + PAGE)
    const geo = galleryPanels(rowW(), list.length, safe() - start, GROW, GAP)
    const idleTitleW = props.rowPeek ? 0.66 * (918 - props.rowPeek) : 626.4
    const map = {}
    const keys = list.map((it, i) => {
      const idx = start + i
      const title = (it.Name || '').toUpperCase()
      const k = (it.Id || '') + '-' + idx
      map[k] = {
        x: geo[i].x,
        w: geo[i].w,
        active: idx === safe(),
        img: backdropOf(it, { maxWidth: 1000, quality: 80 }),
        num: padIndex(idx),
        title,
        titleFont: fontFor(title, 'bold'),
        titleW: idleTitleW,
      }
      return k
    })
    return { keys, map }
  })
  const panelKeys = createMemo(() => panels().keys)
  const activePanel = createMemo(() => {
    const p = panels()
    const k = p.keys.find((key) => p.map[key].active)
    return k ? p.map[k] : { x: 0, w: 0 }
  })
  const lines = createMemo(() => {
    const inner = rowH() - 32
    const wrap = 0.66 * inner
    const line = Math.max(12, (inner - 33 - wrap - 40) / 2)
    return { l1: 59, line, wrapY: 59 + line + 10, wrap, l2: 59 + line + 10 + wrap + 10 }
  })
  // Inside the active panel's 40 by 48 padding, the left column takes three parts and the right two
  // of what's left once the right card's own padding and border are out.
  const cols = createMemo(() => {
    const free = activePanel().w - 96 - 28 - 38
    const leftW = (free * 3) / 5
    return { leftW, rightX: 48 + leftW + 28, rightW: (free * 2) / 5 + 38 }
  })
  const title = () => (item().Name || '').toUpperCase()
  const rel = createMemo(() => {
    relVer()
    return releaseOf(bar, item().Id)
  })
  const pills = createMemo(() => {
    const it = item()
    const out = []
    if (it.Type !== 'Series' && it.RunTimeTicks) {
      const dur = formatDuration(it.RunTimeTicks)
      if (dur && dur !== '0m') out.push({ text: dur, kind: 'plain' })
    }
    if (it.OfficialRating) out.push({ text: it.OfficialRating, kind: 'outlined' })
    if (it.ProductionYear) out.push({ text: String(it.ProductionYear), kind: 'plain' })
    ;(it.Genres || []).slice(0, GENRES).forEach((g) => out.push({ text: g, kind: 'tinted' }))
    return out.map((p) => ({ ...p, font: fontFor(p.text, 'bold') }))
  })
  // The pills measured in their face, the outlined one carrying a border.
  const pillLayout = createMemo(() => {
    facesIn()
    const sized = pills().map((p) => {
      const outlined = p.kind === 'outlined'
      return { ...p, w: textWidth(p.text, 18, 'bold') + 20 + (outlined ? 2 : 0), h: outlined ? 45 : 43, tx: outlined ? 11 : 10 }
    })
    return wrapPills(sized, cols().leftW + 4)
  })
  const overview = () => (!cfg().hideDesc && item().Overview ? item().Overview : '')
  // The left column top to bottom, with the margins collapsing the way blocks do.
  const left = createMemo(() => {
    const labelTop = titleH() + 13
    const pillsY = labelH() ? labelTop + labelH() : titleH() + 12
    const pillsEnd = pillsY + pillLayout().h
    // RatingsRow reports its 8px top margin and its -4px bottom one in its height, and the top one
    // collapses into the badges' 12px.
    const hasRatings = ratingsH() > 0
    const ratingsY = pillsEnd + 4
    const overviewY = hasRatings ? pillsEnd + ratingsH() + 18 : pillsEnd + 14
    const h = overview() ? overviewY + overviewH() : hasRatings ? pillsEnd + 4 + ratingsH() : pillsEnd + 12
    return { labelTop, pillsY, ratingsY, overviewY, h, y: 40 + (rowH() - 80 - h) / 2 }
  })
  const detail = () => {
    detailVer()
    return detailId() ? detailCache[detailId()] || null : null
  }
  const credits = createMemo(() => {
    const d = detail()
    if (!d) return []
    const out = []
    let y = 19
    if (d.director) {
      out.push({ label: $L('Director').toUpperCase(), value: d.director, font: fontFor(d.director, 'bold'), y, which: 'dir' })
      y += 37 + dirH() + 12
    }
    if (d.cast && d.cast.length) {
      const value = d.cast.join(', ')
      out.push({ label: $L('STARRING'), value, font: fontFor(value, 'bold'), y, which: 'cast' })
    }
    return out
  })
  const shimmer = createMemo(() => {
    if (detail()) return []
    const w = cols().rightW - 38
    return [0.4, 0.7, 0.3, 0.85].map((f, i) => ({ y: 19 + i * 28, w: w * f }))
  })
  const rightH = () => {
    const d = detail()
    if (!d) return 38 + 112
    let h = 38
    if (d.director) h += 37 + dirH()
    if (d.cast && d.cast.length) h += (d.director ? 12 : 0) + 37 + castH()
    return h
  }
  const rightY = () => 40 + (rowH() - 80 - rightH()) / 2
  // The active panel's frame, where the trailer plays.
  const trailerRect = () => {
    const p = activePanel()
    return { x: rowX() + p.x, y: ROW_Y, w: p.w, h: rowH() }
  }
  const hole = createMemo(() => (active() ? trailerRect() : { x: 0, y: 0, w: 0, h: 0 }))
  const arrows = createMemo(() => arrowSpots(count(), 1080 - (props.rowPeek || 0), cfg().left))
  const glowLine = rgbA(glow, 0.7)
  const panelShadow = glowOf({ color: rgbA(glow, 0.55), x: 0, y: 0, blur: 26, spread: 0 }).shadow

  // The director and cast, asked for once the slide has stayed a moment.
  const loadDetail = (it) => {
    clearTimeout(detailTimer)
    detailFor = it.Id
    if (!it.Id || it._external || !detailCache[it.Id]) setDetailId('')
    else setDetailId(it.Id)
    if (!it.Id || it._external || detailCache[it.Id]) return
    detailTimer = setTimeout(async () => {
      // A failed ask shows an empty card this time and asks again next time.
      let key = 'failed:' + it.Id
      try {
        const full = await api.getItem(it.Id)
        const people = full && Array.isArray(full.People) ? full.People : []
        const director = people.find((p) => p.Type === 'Director')
        key = it.Id
        detailCache[key] = {
          director: director ? director.Name : null,
          cast: people
            .filter((p) => p.Type === 'Actor')
            .slice(0, CAST)
            .map((p) => p.Name),
        }
      } catch (e) {
        detailCache[key] = { director: null, cast: [] }
      }
      if (detailFor !== it.Id) return
      setDetailId(key)
      setDetailVer(detailVer() + 1)
    }, DETAIL_DELAY)
  }
  const slideChanged = () => {
    const it = (props.items || [])[untrack(safe)]
    if (!it) return
    // The active panel's details fade in again for every slide.
    if (fadeNode) {
      fadeNode.alpha = 0
      fadeNode.animate({ alpha: 1 }, { duration: 500, delay: 180, easing: 'ease' }).start()
    }
    loadDetail(it)
    if (props.onBarSlide) props.onBarSlide(it)
    trailer.sync()
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
  const trailer = trailerHost(bar, { current: () => (props.items || [])[safe()], rect: trailerRect, onEnded: () => go(1) })

  createEffect(
    on(
      () => props.items,
      () => {
        detailCache = {}
        setCur(0)
        loadReleases(bar)
        slideChanged()
        if (bar._focused) restart()
      },
    ),
  )
  createEffect(on(holding, restart, { defer: true }))
  onMount(() => {
    // The pills are measured on a canvas in the same faces, once they have loaded.
    textReady().then(() => setFacesIn(facesIn() + 1))
  })
  // The shimmer breathes while the credits load, except on the slowest tier. Its timer runs only
  // then, on the beat it has kept since the bar came up.
  const shimmering = createMemo(() => !cfg().still && !detail())
  const born = Date.now()
  const stopPulse = () => {
    clearTimeout(pulseTimer)
    clearInterval(pulseTimer)
  }
  createEffect(() => {
    stopPulse()
    if (!shimmering()) return
    const beat = () => onScreen(bar) && setPulse(!pulse())
    pulseTimer = setTimeout(() => {
      beat()
      pulseTimer = setInterval(beat, 1200)
    }, 1200 - ((Date.now() - born) % 1200))
  })
  onCleanup(() => {
    clearTimeout(detailTimer)
    stopPulse()
    stopCarousel(bar)
    trailer.destroy()
  })

  const onFocusChanged = (has) => {
    bar._focused = has
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
      // A click on the banner opens its title (app/pointer.js). The bar spans the screen under
      // Home's rows, so hovering it doesn't take focus from them.
      onPointerClick={(n) => {
        pointerFocus(n)
        return true
      }}
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
      <GalleryGround glow={glow} bg={cfg().bg} hx={hole().x} hy={hole().y} hw={hole().w} hh={hole().h} hr={14} />

      <view x={rowX()} y={ROW_Y}>
        <view>
          <For each={panelKeys()}>
            {(k) => {
              const p = () => panels().map[k] || EMPTY
              return (
                <view
                  transition={{ x: PANEL_T, width: PANEL_T }}
                  x={p().x}
                  width={p().w}
                  height={rowH()}
                  borderRadius={14}
                  color="#00000000"
                  shadow={panelShadow}
                  alpha={p().active ? 1 : 0}
                />
              )
            }}
          </For>
        </view>
        <view>
          <For each={panelKeys()}>
            {(k) => {
              const p = () => panels().map[k] || EMPTY
              return (
                <view transition={{ x: PANEL_T, width: PANEL_T }} x={p().x} width={p().w} height={rowH()} clipping>
                  <view
                    transition={{ width: PANEL_T, alpha: { duration: 620, easing: 'ease' } }}
                    width={p().w}
                    height={rowH()}
                    src={p().img || undefined}
                    textureOptions={COVER}
                    borderRadius={14}
                    alpha={p().active ? (active() ? 0 : 1) : IDLE_ALPHA}
                  />
                  <view
                    transition={{ width: PANEL_T, alpha: { duration: 400, easing: 'ease' } }}
                    width={p().w}
                    height={rowH()}
                    src="images/gallery-scrim.webp"
                    color={cfg().scrim}
                    borderRadius={14}
                    alpha={p().active && active() ? 0 : 1}
                  />
                  <view transition={{ alpha: { duration: 400, easing: 'ease' } }} alpha={p().active ? 0 : 1}>
                    <text
                      transition={{ x: PANEL_T }}
                      x={p().w / 2}
                      y={16 + SHIFT.index}
                      mountX={0.5}
                      fontFamily={cfg().labelFont}
                      fontSize={20}
                      lineHeight={33}
                      letterSpacing={1}
                      color={cfg().index}
                      textShadow={SHADOWS.index}
                    >
                      {p().num}
                    </text>
                    <view
                      transition={{ x: PANEL_T }}
                      x={p().w / 2 - 1}
                      y={lines().l1}
                      width={2}
                      height={lines().line}
                      borderRadius={1}
                      color={glowLine}
                    />
                    <text
                      transition={{ x: PANEL_T }}
                      x={p().w / 2 + SHIFT.vtitle}
                      y={lines().wrapY + lines().wrap / 2}
                      mountX={0.5}
                      mountY={0.5}
                      rotation={-Math.PI / 2}
                      fontFamily={p().titleFont}
                      fontSize={22}
                      lineHeight={33}
                      letterSpacing={2}
                      maxWidth={p().titleW}
                      maxLines={1}
                      contain="width"
                      textAlign="center"
                      color={cfg().onBg}
                      textShadow={SHADOWS.vtitle}
                    >
                      {p().title}
                    </text>
                    <view
                      transition={{ x: PANEL_T }}
                      x={p().w / 2 - 1}
                      y={lines().l2}
                      width={2}
                      height={lines().line}
                      borderRadius={1}
                      color={glowLine}
                    />
                  </view>
                </view>
              )
            }}
          </For>
        </view>

        <view x={activePanel().x} width={activePanel().w} height={rowH()} clipping>
          <view ref={fadeNode}>
            <view x={48} y={left().y} alpha={active() ? 0 : 1}>
              <text
                y={SHIFT.title}
                fontFamily={fontFor(title(), 'bold')}
                fontSize={52}
                lineHeight={53.04}
                letterSpacing={1}
                maxWidth={cols().leftW}
                maxLines={2}
                color={cfg().onBg}
                textShadow={SHADOWS.title}
                onEvent={{ loaded: (_, e) => e && e.dimensions && e.dimensions.h && setTitleH(e.dimensions.h) }}
              >
                {breakable(title())}
              </text>
              <NewReleaseLabel
                y={left().labelTop}
                kind={rel().kind}
                season={rel().season}
                episode={rel().episode}
                tagline={rel().tagline}
                onSize={setLabelH}
              />
              <view y={left().pillsY}>
                <Index each={pillLayout().list}>
                  {(p) => (
                    <view
                      x={p().x}
                      y={p().y}
                      width={p().w}
                      height={p().h}
                      borderRadius={cfg().pillRadius}
                      color={p().kind === 'outlined' ? '#00000000' : cfg().pill}
                      border={p().kind === 'outlined' ? cfg().outline : NO_OUTLINE}
                    >
                      <text
                        x={p().tx}
                        y={(p().kind === 'outlined' ? 6 : 5) + SHIFT.pill}
                        fontFamily={p().font}
                        fontSize={18}
                        lineHeight={33}
                        letterSpacing={cfg().spacing}
                        color={cfg().onBg}
                      >
                        {p().text}
                      </text>
                    </view>
                  )}
                </Index>
              </view>
              <view y={left().ratingsY}>
                <Show when={item().Id}>
                  <RatingsRow
                    item={item()}
                    compact
                    surface="mediaBar"
                    pluginEnabled={cfg().mdb}
                    maxW={cols().leftW}
                    onLayout={(box) => setRatingsH(box && !box.empty ? box.h : 0)}
                  />
                </Show>
              </view>
              <text
                y={left().overviewY + SHIFT.overview}
                fontFamily={fontFor(overview())}
                fontSize={22}
                lineHeight={31.9}
                letterSpacing={cfg().spacing}
                maxWidth={cols().leftW}
                maxLines={4}
                color={cfg().overview}
                textShadow={SHADOWS.overview}
                onEvent={{ loaded: (_, e) => e && e.dimensions && setOverviewH(untrack(overview) ? e.dimensions.h : 0) }}
              >
                {breakable(overview())}
              </text>
            </view>
            <view
              x={cols().rightX}
              y={rightY()}
              width={cols().rightW}
              height={rightH()}
              borderRadius={cfg().cardRadius}
              color={cfg().card}
              border={cfg().cardBorder}
              alpha={active() ? 0 : 1}
            >
              <view>
                <Index each={shimmer()}>
                  {(s) => (
                    <view
                      transition={{ alpha: { duration: 1200, easing: 'ease-in-out' } }}
                      x={19}
                      y={s().y}
                      width={s().w}
                      height={16}
                      borderRadius={6}
                      color={cfg().shimmer}
                      alpha={cfg().still || pulse() ? 1 : 0.5}
                    />
                  )}
                </Index>
              </view>
              <view>
                <Index each={credits()}>
                  {(c) => (
                    <view x={19} y={c().y}>
                      <text
                        y={SHIFT.label}
                        fontFamily={cfg().labelFont}
                        fontSize={16}
                        lineHeight={33}
                        letterSpacing={1}
                        color={cfg().accent}
                      >
                        {c().label}
                      </text>
                      <text
                        y={37 + SHIFT.value}
                        fontFamily={c().font}
                        fontSize={20}
                        lineHeight={33}
                        letterSpacing={cfg().spacing}
                        maxWidth={cols().rightW - 38}
                        maxLines={2}
                        color={cfg().onBg}
                        onEvent={{
                          loaded: (_, e) => {
                            const h = e && e.dimensions && e.dimensions.h
                            if (!h) return
                            if (untrack(c).which === 'dir') setDirH(h)
                            else setCastH(h)
                          },
                        }}
                      >
                        {breakable(c().value)}
                      </text>
                    </view>
                  )}
                </Index>
              </view>
            </view>
          </view>
        </view>
      </view>

      {/* shortcut: the arrows don't blur the panels behind them, since there's no picture of what lies
          behind them to blur, so a vertical title can show under the right one. A render-to-texture
          pass would do it. */}
      <view>
        <Index each={arrows()}>
          {(a) => (
            <CarouselArrow
              ax={a().x}
              ay={a().y}
              icon={a().icon}
              frost=""
              ink={cfg().arrowInk}
              radius={35}
              onPointerClick={() => {
                pointerFocus(bar.root)
                go(a().icon === 'chevron_left' ? -1 : 1)
              }}
            />
          )}
        </Index>
      </view>
    </view>
  )
}
