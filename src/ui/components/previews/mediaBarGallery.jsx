import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import RatingsRow from '../home/RatingsRow.jsx'
import { genreGlowRgb } from '../home/galleryGlow.js'
import { padIndex, rgbA } from '../home/barMath.js'
import { textWidth } from '../details/measure.js'
import { MediaBarRelease, RELEASE_H } from './mediaBarLogo.jsx'
import { gradientUrl } from './mediaBarKit.js'
import { COVER, artColor, itemAt, lineCount, runtimeText } from './kit.js'
import { SAMPLE_RATINGS, ratedSample } from './sampleRatings.js'

// The Gallery bar preview: the first title opened up in a wide panel over a glow in its genre's
// color, with its facts and a cast card, and the next four as narrow panels beside it, each numbered
// with its title running up it.
const ROW_X = 24
const ROW_Y = 540 * 0.09
const UNIT = (912 - 5 * 6) / 20
const ACTIVE_W = UNIT * 16
const IDLE_OUT = UNIT + 6
const ACTIVE_OUT = ACTIVE_W + 6
const ART_X = ROW_X + 3
const CONTENT_X = ART_X + 28
const CONTENT_W = ACTIVE_W - 28 - 24
const COL_W = ((CONTENT_W - 28 - 38) * 3) / 5
const SIDE_X = CONTENT_X + COL_W + 28
const SIDE_W = CONTENT_W - COL_W - 28
const NUM_SHIFT = cssShift(14)
const TITLE_SHIFT = cssShift(34)
const OVERVIEW_SHIFT = cssShift(16)
const HEAD_SHIFT = cssShift(11)
const ART_Y = ROW_Y + 30

// The badges wrap with 8px after each and under each line, each stretched to its line's height.
const badgeFlow = (badges, maxW) => {
  const lines = []
  let line = null
  badges.forEach((b) => {
    b.w = textWidth(b.text, 12, 'bold') + 20 + (b.outlined ? 2 : 0)
    if (!line || (line.items.length && line.w + b.w + 8 > maxW + 0.01)) {
      line = { items: [], w: 0, h: 0 }
      lines.push(line)
    }
    line.items.push(b)
    line.w += b.w + 8
    line.h = Math.max(line.h, b.outlined ? 45 : 43)
  })
  const out = []
  let y = 0
  lines.forEach((ln, li) => {
    let x = 0
    ln.items.forEach((b, i) => {
      out.push({ ...b, k: `b${li}-${i}`, x, y, h: ln.h, ty: (b.outlined ? 6 : 5) + cssShift(12) })
      x += b.w + 8
    })
    y += ln.h + 8
  })
  return { badges: out, h: y }
}

export default function MediaBarGallery(props) {
  const [ratingsH, setRatingsH] = createSignal(0)
  const bold = uiFont('bold')
  const active = () => props.items[0]
  const artH = () => 540 - ROW_Y - 540 * 0.03 - (props.peek || 0) - 30
  const glow = createMemo(() => {
    const rgb = genreGlowRgb(active().genres)
    const bg = props.t.background.slice(0, 7) + '00'
    return gradientUrl({ w: 960, h: 540, rx: 1056, ry: 594, cx: 384, cy: 297, stops: [[rgbA(rgb, 0.42), 0], [rgbA(rgb, 0.14), 0.45], [bg, 1]] })
  })
  const scrim = createMemo(() => {
    const h = artH()
    return gradientUrl({ w: ACTIVE_W, h, angle: (Math.atan(h / ACTIVE_W) * 180) / Math.PI, stops: [[props.t.scrimA(0.95), 0], [props.t.scrimA(0.15), 1]] })
  })
  const title = () => (active().title || '').toUpperCase()
  const badgeLayout = createMemo(() => {
    const a = active()
    const list = []
    if (a.runtimeMinutes) list.push({ text: runtimeText(a.runtimeMinutes) })
    if (a.officialRating) list.push({ text: a.officialRating, outlined: true })
    if (a.year) list.push({ text: String(a.year) })
    a.genres.slice(0, 3).forEach((g) => list.push({ text: g, tinted: true }))
    return badgeFlow(list, COL_W)
  })
  const outline = () => ({ width: 1, color: hex(props.t.onSurfaceA(0.55)) })
  const overview = () => active().overview || ''
  // The column stacked up from the content's foot: overview, ratings, badges, label and title.
  const col = createMemo(() => {
    const titleLines = Math.min(2, lineCount(title(), 34, 'bold', COL_W, 1))
    const ovLines = overview() ? Math.min(3, lineCount(overview(), 16, 'regular', COL_W)) : 0
    const rel = !!active().newRelease
    const total = titleLines * 34.68 + (rel ? 8 + RELEASE_H : 0) + 12 + badgeLayout().h + ratingsH() + (ovLines ? 14 + ovLines * 23.2 : 0)
    const bottom = ART_Y + artH() - 24
    let y = bottom - total
    const titleY = y
    y += titleLines * 34.68
    const relY = y + 8
    if (rel) y += 8 + RELEASE_H
    const badgesY = y + 12
    y += 12 + badgeLayout().h
    const ratingsY = y
    y += ratingsH()
    return { titleY, relY, badgesY, ratingsY, ovY: y + 14, sideY: bottom - 172 }
  })
  const rated = createMemo(() => ratedSample(active()))
  const idle = createMemo(() => {
    const len = artH() - 48
    return [1, 2, 3, 4].map((i) => {
      const item = itemAt(props.items, i)
      const t = (item.title || '').toUpperCase()
      return { k: 'i' + i, x: ROW_X + ACTIVE_OUT + (i - 1) * IDLE_OUT + 3, num: padIndex(i), src: item.backdropUrl, title: t, font: fontFor(t, 'bold'), len }
    })
  })
  const fill = () => props.t.onSurfaceA(0.12)
  return (
    <view width={960} height={540}>
      <view width={960} height={540} src={glow()} color="#ffffffff" />
      <view x={ART_X} y={ART_Y} width={ACTIVE_W} height={artH()} borderRadius={14} src={active().backdropUrl || ''} textureOptions={COVER} color={artColor(active().backdropUrl, props.t)} />
      <view x={ART_X} y={ART_Y} width={ACTIVE_W} height={artH()} borderRadius={14} src={scrim()} color="#ffffffff" />
      <view x={ART_X} y={ART_Y} width={ACTIVE_W} height={artH()} clipping>
        <view x={-ART_X} y={-ART_Y} width={960} height={540}>
          <view x={CONTENT_X} width={COL_W} height={540}>
            <text fontFamily={fontFor(title(), 'bold')} fontSize={34} lineHeight={34.68} letterSpacing={1} y={col().titleY + TITLE_SHIFT} maxWidth={COL_W} maxLines={2} color={props.t.onSurface}>
              {title()}
            </text>
            <view>
              <Show when={active().newRelease}>
                <MediaBarRelease y={col().relY} />
              </Show>
            </view>
            <view y={col().badgesY} width={COL_W} height={badgeLayout().h}>
              <view>
                <For each={badgeLayout().badges}>
                  {(b) => (
                    <view x={b.x} y={b.y} width={b.w} height={b.h} borderRadius={8} color={b.tinted ? props.t.accentA(0.22) : props.t.scrimA(0.35)}>
                      <text fontFamily={fontFor(b.text, 'bold')} fontSize={12} lineHeight={33} x={b.outlined ? 11 : 10} y={b.ty} color={props.t.onSurface}>
                        {b.text}
                      </text>
                    </view>
                  )}
                </For>
              </view>
              <view>
                <For each={badgeLayout().badges.filter((b) => b.outlined)}>
                  {(o) => <view x={o.x} y={o.y} width={o.w} height={o.h} borderRadius={8} color="#00000000" border={outline()} />}
                </For>
              </view>
            </view>
            <RatingsRow
              y={col().ratingsY}
              item={rated()}
              surface="mediaBar"
              compact
              sampleRatings={SAMPLE_RATINGS}
              pluginEnabled={isMdblistEnabled(props.s, 'mediaBar')}
              zoom={0.5}
              maxW={COL_W / 0.5}
              prefs={props.s}
              onLayout={(b) => setRatingsH(b.empty ? 0 : b.h)}
            />
            <text fontFamily={fontFor(overview())} fontSize={16} lineHeight={23.2} y={col().ovY + OVERVIEW_SHIFT} maxWidth={COL_W} maxLines={3} color={props.t.onSurfaceA(0.9)}>
              {overview()}
            </text>
          </view>
          <view x={SIDE_X} y={col().sideY} width={SIDE_W} height={172} borderRadius={18} color={props.t.scrimA(0.55)} border={{ width: 1, color: hex(fill()) }}>
            <text fontFamily={bold} fontSize={11} lineHeight={33} letterSpacing={1.4} x={19} y={19 + HEAD_SHIFT} color={props.t.accent}>
              {$L('Director').toUpperCase()}
            </text>
            <view x={19} y={58} width={120} height={12} borderRadius={6} color={fill()} />
            <text fontFamily={bold} fontSize={11} lineHeight={33} letterSpacing={1.4} x={19} y={84 + HEAD_SHIFT} color={props.t.accent}>
              {$L('STARRING').toUpperCase()}
            </text>
            <view x={19} y={123} width={160} height={12} borderRadius={6} color={fill()} />
            <view x={19} y={141} width={140} height={12} borderRadius={6} color={fill()} />
          </view>
        </view>
      </view>
      <view>
        <For each={idle()}>
          {(p) => (
            <view x={p.x} width={UNIT} height={540}>
              <text fontFamily={bold} fontSize={14} lineHeight={33} letterSpacing={1.5} y={48.6 + NUM_SHIFT} maxWidth={44.1} contain="width" textAlign="center" color={props.t.onSurfaceA(0.85)}>
                {p.num}
              </text>
              <view y={ART_Y} width={44.1} height={artH()} borderRadius={14} src={p.src || ''} textureOptions={COVER} color={artColor(p.src, props.t)} alpha={0.35} />
              <view x={21.05} y={ART_Y} width={2} height={24} color={props.t.accentA(0.7)} />
              <view x={21.05} y={ART_Y + artH() - 24} width={2} height={24} color={props.t.accentA(0.7)} />
              <text
                x={UNIT / 2 + NUM_SHIFT}
                y={ART_Y + 24 + p.len / 2}
                mountX={0.5}
                mountY={0.5}
                rotation={-Math.PI / 2}
                fontFamily={p.font}
                fontSize={14}
                lineHeight={33}
                letterSpacing={2}
                maxWidth={p.len}
                maxLines={1}
                contain="width"
                textAlign="center"
                color={props.t.onSurface}
              >
                {p.title}
              </text>
            </view>
          )}
        </For>
      </view>
    </view>
  )
}
