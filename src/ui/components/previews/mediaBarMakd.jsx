import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { formatPlaybackEndsAt } from '../../../utils/playbackTimeLabels.js'
import { face, facesReady, textWidth } from '../home/faces.js'
import { hex } from '../../color.js'
import MediaBarLogo, { MediaBarRelease, RELEASE_H } from './mediaBarLogo.jsx'
import { dotsLayout, gradientUrl } from './mediaBarKit.js'
import { artColor, coverAt } from './kit.js'
import { keyed } from '../library/pageKit.js'

// The MakD bar preview in its v6 Classic look on the half size screen: the art under MakD's shade
// and 130 degree wash, faded into the page over the bottom 8%, the logo, facts, genres, overview and
// buttons stacked up from the bottom left, and five slide marks bottom right.
const COL_W = 441.6
const LOGO_H = 118.8
const LINE = 33
const SEP_W = 15
const ART_FIT = coverAt(0.5, 0.2)
const RING = { width: 1, color: hex('#ffffff59') }
// The page shows through the fade: clear up to 2% from the bottom, half at 6%, solid art from 8%.
const FADE = [
  { k: 'f0', y: 540 - 43.2, h: 10.8, top: 0, bottom: 0.5 },
  { k: 'f1', y: 540 - 32.4, h: 21.6, top: 0.5, bottom: 1 },
  { k: 'f2', y: 540 - 10.8, h: 10.8, top: 1, bottom: 1 },
]
const FACES = ['archivo-narrow', 'archivo-narrow-medium', 'archivo-narrow-semibold', 'archivo-narrow-bold', 'noto-sans']

// Items in a wrapping row of 33px lines, separated by a 5px dot with 5px margins.
const flow = (items, maxW) => {
  let x = 0
  let line = 0
  const out = []
  items.forEach((it, i) => {
    if (i > 0 && x + SEP_W + it.w > maxW + 0.01) {
      x = 0
      line++
    } else if (i > 0) {
      out.push({ k: 'sep' + i, sep: true, x: x + 5, y: line * LINE + 14, w: 5, text: '' })
      x += SEP_W
    }
    out.push({ ...it, x, y: line * LINE })
    x += it.w
  })
  return { items: out, lines: items.length ? line + 1 : 0 }
}

// Lines of [text] at [size] in face [name] within [width], breaking at spaces.
const lineCount = (text, size, name, width) => {
  if (!text) return 0
  let lines = 1
  let cur = ''
  String(text).split(' ').forEach((w) => {
    const next = cur ? cur + ' ' + w : w
    if (cur && textWidth(next, size, name) > width) {
      lines++
      cur = w
    } else cur = next
  })
  return lines
}

const withA = (c, a) => c.slice(0, 7) + ('0' + Math.round(a * 255).toString(16)).slice(-2)

export default function MediaBarMakd(props) {
  const [fontsIn, setFontsIn] = createSignal(0)
  const [ovH, setOvH] = createSignal(0)
  // A run's width as its own text laid it out, with the canvas measure until then.
  const [tw, setTw] = createSignal({})
  const widthOf = (text, size, f) => {
    const got = tw()[f + '|' + text]
    return got != null ? got : textWidth(text, size, f)
  }
  const measured = (run) => (node, e) => {
    const d = e && e.dimensions
    if (!d || !d.w || (e.type && e.type !== 'text')) return
    const key = run().f + '|' + run().text
    if (tw()[key] !== d.w) setTw({ ...tw(), [key]: d.w })
  }
  const item = () => props.items[0]
  // The shade and the wash are one tint, so they go down as one layer: each stop's alpha over the
  // shade's. The result runs straight with the wash's, so the merged stops are exact.
  const wash = createMemo(() => {
    const t = props.t
    const alpha = (c) => parseInt(c.slice(7, 9), 16) / 255
    const shade = alpha(t.makdA(0.4))
    const stop = (k, at) => [withA(t.makdA(0), 1 - (1 - shade) * (1 - alpha(t.makdA(k)))), at]
    return gradientUrl({ w: 960, h: 540, angle: 130, stops: [stop(1.3, 0.1), stop(0.7, 0.3), stop(0, 1)] })
  })
  const info = createMemo(() => {
    fontsIn()
    const it = item()
    const parts = []
    if (it.communityRating) {
      const text = it.communityRating.toFixed(1)
      const f = face('archivo', 500, text)
      parts.push({ k: 'stars', text, f, w: 14 + 1.75 + widthOf(text, 10, f), dx: 15.75, star: true })
    }
    if (it.year) {
      const text = String(it.year)
      const f = face('archivo', 500, text)
      parts.push({ k: 'year', text, f, w: widthOf(text, 10, f), dx: 0 })
    }
    if (it.officialRating) {
      const f = face('archivo', 600, it.officialRating)
      parts.push({ k: 'age', text: it.officialRating, f, w: widthOf(it.officialRating, 10, f) + 10, dx: 5, chip: true })
    }
    const endsAt = it.type !== 'Series' && it.runtimeMinutes ? formatPlaybackEndsAt(it.runtimeMinutes * 60, props.s.clockDisplay, props.s.timeOffsetHours) : ''
    if (endsAt) {
      const f = face('archivo', 500, endsAt)
      parts.push({ k: 'ends', text: endsAt, f, w: widthOf(endsAt, 10, f), dx: 0 })
    }
    return flow(parts, COL_W)
  })
  const genres = createMemo(() => {
    fontsIn()
    return flow(
      item().genres.slice(0, 3).map((g, i) => {
        const f = face('archivo', 400, g)
        return { k: 'g' + i, text: g, f, w: widthOf(g, 10, f), dx: 0 }
      }),
      COL_W,
    )
  })
  const infoList = keyed(() => info().items, (x) => x.k)
  const genreList = keyed(() => genres().items, (x) => x.k)
  const overview = () => item().overview || ''
  const overviewFont = () => face('noto', 400, overview())
  const play = createMemo(() => {
    fontsIn()
    const text = $L('Play')
    const f = face('archivo', 700, text)
    return { text, f, w: 6.3 + 11 + 3 + widthOf(text, 9, f) + 6.3 }
  })
  // The column from its foot up: buttons, overview, genres, facts, the new release label and the logo.
  const col = createMemo(() => {
    fontsIn()
    const bottom = 540 - (props.peek || 0) - 17.5
    const ovLines = Math.min(3, lineCount(overview(), 10, overviewFont(), COL_W))
    const rel = !!item().newRelease
    const infoH = info().lines ? 9 + info().lines * LINE : 0
    const genresH = genres().lines ? 9 + genres().lines * LINE : 0
    const ovBox = ovLines ? 9 + (ovH() || ovLines * 13.5) : 0
    const total = LOGO_H + 4 + (rel ? 8 + RELEASE_H : 0) + infoH + genresH + ovBox + 13 + 25
    let y = bottom - total
    const logoY = y
    y += LOGO_H + 4
    const relY = y + 8
    if (rel) y += 8 + RELEASE_H
    const infoY = y + 9
    y += infoH
    const genresY = y + 9
    y += genresH
    const ovY = y + 9
    y += ovBox
    return { logoY, relY, infoY, genresY, ovY, buttonsY: y + 13 }
  })
  const dots = createMemo(() => {
    const d = dotsLayout(props.s.featuredItemCount, { max: 5, active: 5, inactive: 5, gap: 2.5, activeScale: 1.7 })
    return { x: 960 - 28.8 - d.w, y: 540 - (props.peek || 0) - 17.5 - d.h, marks: d.marks }
  })
  onMount(() => facesReady(FACES).then(() => setFontsIn(fontsIn() + 1)))
  const fadeOf = (f) => ({ top: withA(props.t.background, f.top), bottom: withA(props.t.background, f.bottom) })
  return (
    <view width={960} height={540}>
      <view width={960} height={540} src={item().backdropUrl || ''} textureOptions={ART_FIT} color={artColor(item().backdropUrl, props.t)} />
      <view width={960} height={540} src={wash()} color="#ffffffff" />
      <For each={FADE}>{(f) => <view y={f.y} width={960} height={f.h} colorTop={fadeOf(f).top} colorBottom={fadeOf(f).bottom} />}</For>
      <view x={38.4} width={COL_W + 100} height={540}>
        <MediaBarLogo y={col().logoY} w={COL_W} h={LOGO_H} align="bottomLeft" url={item().logoUrl} title={item().title} size={40} weight="regular" lh={44} ink="#ffffffff" />
        <view>
          <Show when={item().newRelease}>
            <MediaBarRelease y={col().relY} />
          </Show>
        </view>
        <view y={col().infoY} width={COL_W} height={info().lines * LINE}>
          <For each={infoList.keys()}>
            {(k) => {
              const it = infoList.item(k)
              return (
                <view x={it().x} y={it().y} width={it().w} height={33} borderRadius={it().chip ? 2.5 : 0} color={it().chip ? '#ffffffcc' : '#00000000'}>
                  <view alpha={it().sep ? 1 : 0} width={3.33} height={3.33} x={0.83} y={0.83} borderRadius={1.67} color="#ffffff8c" />
                  <view alpha={it().star ? 1 : 0} y={9.5} width={14} height={14} src="icons/preview/m_star.webp" color="#f2b01eff" />
                  <text fontFamily={it().f || 'archivo-narrow'} fontSize={10} lineHeight={33} x={it().dx || 0} color={it().chip ? '#000000ff' : '#ffffffff'} onEvent={{ loaded: measured(it) }}>
                    {it().text}
                  </text>
                </view>
              )
            }}
          </For>
        </view>
        <view y={col().genresY} width={COL_W} height={genres().lines * LINE}>
          <For each={genreList.keys()}>
            {(k) => {
              const g = genreList.item(k)
              return (
                <view x={g().x} y={g().y} width={g().w} height={33}>
                  <view alpha={g().sep ? 1 : 0} width={3.33} height={3.33} x={0.83} y={0.83} borderRadius={1.67} color="#ffffff8c" />
                  <text fontFamily={g().f || 'archivo-narrow'} fontSize={10} lineHeight={33} color="#ffffffff" onEvent={{ loaded: measured(g) }}>
                    {g().text}
                  </text>
                </view>
              )
            }}
          </For>
        </view>
        <text
          fontFamily={overviewFont()}
          fontSize={10}
          lineHeight={13.5}
          y={col().ovY}
          maxWidth={COL_W}
          maxLines={3}
          color="#ffffffff"
          onEvent={{ loaded: (node, e) => e && e.type !== 'texture' && e.dimensions && e.dimensions.h && setOvH(e.dimensions.h) }}
        >
          {overview()}
        </text>
        <view y={col().buttonsY} width={COL_W} height={25}>
          <view width={25} height={25} borderRadius={12.5} color="#00000073" border={RING}>
            <view x={7} y={7} width={11} height={11} src="icons/preview/info.webp" color="#ffffffff" />
          </view>
          <view x={32.5} width={play().w} height={25} borderRadius={4} color="#ffffffff">
            <view x={6.3} y={7} width={11} height={11} src="icons/preview/play_arrow.webp" color="#000000ff" />
            <text fontFamily={play().f} fontSize={9} lineHeight={33} x={20.3} y={-4} color="#000000ff" onEvent={{ loaded: measured(play) }}>
              {play().text}
            </text>
          </view>
          <view x={40 + play().w} width={25} height={25} borderRadius={12.5} color="#00000073" border={RING}>
            <view x={7} y={7} width={11} height={11} src="icons/preview/favorite.webp" color="#ffffffff" />
          </view>
        </view>
      </view>
      <view x={dots().x} y={dots().y}>
        <For each={dots().marks}>
          {(d) => (
            <view x={d.x} y={d.y} width={d.w} height={d.h} borderRadius={d.r} color={d.first ? props.t.onSurface : props.t.onSurfaceA(0.6)} scale={d.scale} pivot={0.5} />
          )}
        </For>
      </view>
    </view>
  )
}
