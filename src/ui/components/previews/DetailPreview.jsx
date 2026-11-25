import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { textReady } from '../../text.js'
import { activeThemeId } from '../../theme.js'
import { resolveThemeById } from '../../../theme/themeRegistry.js'
import { applyOledMode } from '../../../utils/oledMode.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { normalizeRatingStyle, personalRatingOf } from '../../../utils/personalRating.js'
import { getSelectionSource, isMdblistEnabled, isRatingSourceEnabled } from '../../../services/mdblistApi.js'
import { premiereDim, premiereScrim } from '../../../pages/Details/premiere/premiereRules.js'
import { quickLookSurface } from '../../../pages/Details/quickLook/quickLookRules.js'
import RatingsRow from '../home/RatingsRow.jsx'
import { keyed } from '../library/pageKit.js'
import { gradientUrl, toBottomRight } from './mediaBarKit.js'
import { SAMPLE_RATINGS, SAMPLE_USER_DATA, ratedSample } from './sampleRatings.js'
import { detailScene, detailFallback } from './detailLayout.js'
import { rgbTriplet } from '../../themeColor.js'

// The detail style preview: the sample film on the details screen in [variant] (v1 Classic to v9
// Frost), drawn from detailLayout.js on the 960 by 540 design screen, or the style's drawn stand-in
// until the library's titles arrive. [s] are the settings with any tried value over them and [t] the
// preview palette.
const hexOf = (rgb) => '#' + rgb.split(',').map((c) => ('0' + Number(c).toString(16)).slice(-2)).join('') + 'ff'
// A theme color, '#AARRGGBB' or '#RRGGBB', as an rgb triplet.
const themeTriplet = (hex) => rgbTriplet('#' + String(hex).replace('#', '').slice(-6))
// Frost's strip: a column per source with its name over its score, the way RatingsRow lays out its
// columns, up to seven.
const stripEntries = (s, item, plugin) => {
  const mine = isRatingSourceEnabled(s, 'personal') ? personalRatingOf(SAMPLE_USER_DATA) : null
  const out = []
  if (mine !== null) out.push({ k: 'personal', name: $L('My Rating'), value: normalizeRatingStyle(s.personalRatingStyle) === 'stars' ? `${(mine / 2).toFixed(1)}/5` : mine.toFixed(1) })
  if (isRatingSourceEnabled(s, 'stars') && item.communityRating) out.push({ k: 'community', name: $L('Community'), value: item.communityRating.toFixed(1) })
  let list = plugin ? SAMPLE_RATINGS : []
  const enabled = s.mdblistRatingSources
  if (Array.isArray(enabled)) {
    list = list
      .filter((r) => enabled.indexOf(getSelectionSource(r.source)) >= 0)
      .sort((a, b) => enabled.indexOf(getSelectionSource(a.source)) - enabled.indexOf(getSelectionSource(b.source)))
  }
  list.forEach((r) => out.push({ k: r.source, name: r.name, value: r.formatted }))
  return out.slice(0, 7)
}

// What a box is, so a node never turns from artwork into a gradient in place.
const kindOf = (b) => b.key || (b.src ? (b.src.indexOf('data:') === 0 ? 'scrim' : 'i' + b.src) : typeof b.color === 'object' ? 'g' : 'f')
// The boxes paint in the order their nodes were made, so a list whose make-up changes is keyed
// afresh as a whole and built again in order.
const hashOf = (text) => {
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  return hash.toString(36)
}
// One options object per fit, since a new one makes the node load its picture again.
const fits = {}
const fitOf = (fit) => {
  if (!fit) return undefined
  const p = fit.position
  const key = fit.type + (p ? '|' + p.x + '|' + p.y : '')
  if (!fits[key]) fits[key] = { resizeMode: p ? { type: fit.type, clipX: p.x, clipY: p.y } : { type: fit.type } }
  return fits[key]
}
const byK = (x) => x.k

export default function DetailPreview(props) {
  const [logoDim, setLogoDim] = createSignal(null)
  const [logoFor, setLogoFor] = createSignal('')
  const [ratingsH, setRatingsH] = createSignal(0)
  const [ratingsW, setRatingsW] = createSignal(0)
  const [fontsIn, setFontsIn] = createSignal(0)
  const shown = createMemo(() => {
    const list = props.items || []
    return props.s.hideDetailsMediaDescription ? list.map((it) => ({ ...it, overview: '' })) : list
  })
  const live = () => shown().length > 0
  const item = () => shown()[0] || null
  const v = () => props.variant || 'v9'
  // Premiere sits on the page's own background, solid.
  const bg = () => {
    if (!live()) return '#00000000'
    return v() === 'v7' ? hexOf(rgbTriplet(props.t.background)) : props.t.background
  }
  const plugin = () => isMdblistEnabled(props.s, undefined)
  const scene = createMemo(() => {
    fontsIn()
    if (!live()) return detailFallback(v(), props.t)
    const it = item()
    const variant = v()
    const bgRgb = rgbTriplet(props.t.background)
    let surface = ''
    if (variant === 'v8') {
      const theme = applyOledMode(resolveThemeById(activeThemeId(props.s)), props.s.oledMode)
      surface = hexOf(quickLookSurface(bgRgb, themeTriplet(theme.colors.onBackground)))
    }
    return detailScene({
      s: props.s,
      t: props.t,
      item: it,
      items: shown(),
      variant,
      logoDim: it.logoUrl && logoFor() === it.logoUrl ? logoDim() : null,
      ratingsH: ratingsH(),
      strip: variant === 'v9' ? stripEntries(props.s, it, plugin()) : [],
      premiereScrim: variant === 'v7' ? scrimSrc(premiereScrim(bgRgb, premiereDim(props.s.backdropBlurDetail))) : '',
      quickLookSurface: surface,
    })
  })
  const boxes = keyed(() => {
    const sig = v() + hashOf(scene().boxes.map(kindOf).join('|'))
    return scene().boxes.map((b, i) => ({ ...b, k: sig + ':' + i }))
  }, byK)
  const rings = keyed(() => scene().rings.map((r, i) => ({ ...r, k: v() + 'r' + i })), byK)
  const texts = keyed(() => scene().texts.map((tx, i) => ({ ...tx, k: v() + 't' + i })), byK)
  // The stand-ins' backdrop, the accent at 34 percent to the surface corner to corner.
  const grads = createMemo(() => {
    const stops = [[props.t.accentA(0.34), 0], [props.t.surface, 1]]
    return scene().grads.map((g, i) => ({ ...g, k: 'g' + i, src: gradientUrl({ w: Math.round(g.w), h: Math.round(g.h), angle: toBottomRight(g.w, g.h), stops }) }))
  })
  const ratingsAt = () => {
    const r = scene().ratings
    if (!r) return { on: false, x: 0, y: 0, maxW: 0, labels: true }
    return { on: true, x: r.center ? r.center - ratingsW() / 2 : r.x, y: r.y, maxW: r.maxW, labels: r.labels }
  }
  const ratingsKey = () => (ratingsAt().on && live() ? v() + (item().id || item().title) : '')
  const rated = createMemo(() => (item() ? ratedSample(item()) : null))
  const logoProbe = () => (live() && item().logoUrl ? item().logoUrl : '')
  onMount(() => textReady().then(() => setFontsIn(fontsIn() + 1)))
  return (
    <view width={960} height={540}>
      <view width={960} height={540} color={bg()} />
      <view>
        <For each={grads()}>{(g) => <view x={g.x} y={g.y} width={g.w} height={g.h} src={g.src} color="#ffffffff" />}</For>
      </view>
      <view>
        <For each={boxes.keys()}>
          {(k) => {
            const b = boxes.item(k)
            return <view x={b().x} y={b().y} width={b().w} height={b().h} src={b().src || ''} color={b().color} borderRadius={b().r} textureOptions={fitOf(b().fit)} />
          }}
        </For>
      </view>
      <view>
        <For each={rings.keys()}>
          {(k) => {
            const r = rings.item(k)
            return <view x={r().x} y={r().y} width={r().w} height={r().h} color="#00000000" borderRadius={r().r} border={{ width: r().border.w, color: r().border.color }} />
          }}
        </For>
      </view>
      <view>
        <Show when={ratingsKey()} keyed>
          {() => (
            <RatingsRow
              x={ratingsAt().x}
              y={ratingsAt().y}
              item={rated()}
              sampleRatings={SAMPLE_RATINGS}
              pluginEnabled={plugin()}
              labels={ratingsAt().labels}
              maxW={ratingsAt().maxW}
              zoom={0.5}
              prefs={props.s}
              onLayout={(box) => {
                setRatingsH(box.empty ? 0 : box.h)
                setRatingsW(box.empty ? 0 : box.w)
              }}
            />
          )}
        </Show>
      </view>
      <view>
        <For each={texts.keys()}>
          {(k) => {
            const tx = texts.item(k)
            return (
              <text
                x={tx().x}
                y={tx().y}
                fontFamily={tx().font}
                fontSize={tx().size}
                lineHeight={tx().lh}
                color={tx().color}
                maxWidth={tx().maxw || 0}
                maxLines={tx().maxlines || 0}
                letterSpacing={tx().ls}
                textShadow={tx().shadow || undefined}
              >
                {tx().text}
              </text>
            )
          }}
        </For>
      </view>
      <view
        width={1}
        height={1}
        alpha={0.001}
        src={logoProbe()}
        color={logoProbe() ? '#ffffffff' : '#00000000'}
        onEvent={{
          loaded: (node, e) => {
            const d = e && e.dimensions
            if (!d || !d.w || !d.h) return
            setLogoDim({ w: d.w, h: d.h })
            setLogoFor(logoProbe())
          },
        }}
      />
    </view>
  )
}
