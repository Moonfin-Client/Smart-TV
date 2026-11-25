import { Index, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import RatingsRow from './RatingsRow.jsx'
import { api, getServerUrl } from '../../../services/jellyfinApi.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import { formatDuration, getBackdropId, getBackdropTag, getImageUrl, toAbsoluteImageUrl, videoResolutionLabel } from '../../../utils/helpers.js'
import { channelLayout, videoCodecName } from '../../../utils/mediaStreamFacts.js'
import { videoRangeLabel } from '../../../utils/videoRange.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import * as settings from '../../../state/settings.js'
import { cssShift, fontFor, textWidth, uiFont } from '../../text.js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { CAROUSEL_PANEL_SCRIM, getCardDisplayTitle, getEpisodeLabels } from './modernCardLayout.js'
import { tx } from '../../fx.js'

// The focused title's panel under a Carousel row's cards: its backdrop on the right behind a scrim,
// and its title, episode, info line, media pills and overview stacked and centered on the left.
// Without an item it stands in empty, for a row still loading. Props: `item`, `w`, `look`,
// `rowFocused`, `hideOverview`, plus `x`, `y`, `alpha`, `zIndex` and `transition` for the row's
// cross fade.

const H = 556

// Home's rows don't ask for media streams, so the panel fetches them once focus rests on a title,
// and keeps what came back.
const MEDIA_FETCH_DELAY_MS = 300
const MEDIA_MEMORY = 200
const mediaCache = new Map()
const rememberMedia = (key, pills) => {
  mediaCache.delete(key)
  mediaCache.set(key, pills)
  if (mediaCache.size > MEDIA_MEMORY) mediaCache.delete(mediaCache.keys().next().value)
}
const [fetched, setFetched] = createSignal(0)

const panelMediaPills = (item) => {
  const sources = item && item.MediaSources
  const streams = (sources && sources[0] && sources[0].MediaStreams) || (item && item.MediaStreams) || []
  const video = streams.find((s) => s.Type === 'Video')
  const audio = streams.find((s) => s.Type === 'Audio' && s.IsDefault) || streams.find((s) => s.Type === 'Audio')
  const range = video ? videoRangeLabel(video) : 'SDR'
  return [
    videoResolutionLabel({ MediaStreams: streams }),
    range !== 'SDR' && range,
    videoCodecName(video && video.Codec),
    audio && audio.Codec && audio.Codec.toUpperCase(),
    channelLayout(audio && audio.Channels),
  ].filter(Boolean)
}

const panelBackdropUrl = (item, serverUrl) => {
  const id = getBackdropId(item)
  if (id) return getImageUrl(serverUrl, id, 'Backdrop', { maxWidth: 1280, quality: 80, tag: getBackdropTag(item) })
  return item._externalBackdropUrl ? toAbsoluteImageUrl(item._externalBackdropUrl, serverUrl) : ''
}
// The backdrop the panel shows for an item, which the row also loads ahead for the cards beside focus.
export const panelBackdrop = (item) => (item ? panelBackdropUrl(item, item._serverUrl || getServerUrl()) : '')

const dotFont = uiFont('medium')
const DOT_W = () => 24 + textWidth('•', 21, 'medium')

// The year, certification chip, runtime and genres along one line, a dot between each. A chip is
// its text padded 11 by 4 inside its border, centered on the 33px line.
const infoParts = (item) => {
  const runtime = item.Type === 'Series' ? '' : formatDuration(item.RunTimeTicks)
  const genres = (item.Genres || []).slice(0, 3)
  let x = 0
  return [
    item.ProductionYear && { text: String(item.ProductionYear) },
    item.OfficialRating && { chip: item.OfficialRating },
    runtime && runtime !== '0m' && { text: runtime },
    genres.length > 0 && { text: genres.join(', ') },
  ]
    .filter(Boolean)
    .map((p, i) => {
      const chip = !!p.chip
      const label = p.chip || p.text
      const dotX = i > 0 ? x + 12 : -1
      if (i > 0) x += DOT_W()
      const w = chip ? textWidth(label, 17, 'bold') + 22 : textWidth(label, 21, 'medium')
      const part = { k: 'i' + i, dotX, x, w, chip, label, font: fontFor(label, chip ? 'bold' : 'medium') }
      x += w
      return part
    })
}

// The media pills, each its text padded 10 inside its border, 8px apart.
const pillsOf = (labels) => {
  let x = 0
  return labels.map((label) => {
    const w = textWidth(label, 16, 'bold') + 0.64 * label.length + 20
    const pill = { k: label, label, x, w }
    x += w + 8
    return pill
  })
}

const SHADOW = { color: shadowColor('#00000073'), x: 0, y: 24, blur: 60, spread: 0 }
const EDGE_ON = { width: 1, color: hex('#ffffff14') }
const EDGE_EMPTY = { width: 1, color: hex('#ffffff1f') }
const PILL_EDGE = { width: 1, color: hex('#ffffff59') }
const BACKDROP = { resizeMode: { type: 'cover', clipX: 0.5, clipY: 0.62 } }

export default function CarouselPanel(props) {
  const [titleH, setTitleH] = createSignal(69.3)
  const [overviewH, setOverviewH] = createSignal(30)
  const [ratingsH, setRatingsH] = createSignal(0)
  const mdb = createMemo(() => isMdblistEnabled(settings.all(), 'homeRows'))
  const m = createMemo(() => {
    const it = props.item
    if (!it) return null
    const title = getCardDisplayTitle(it) || ''
    const labels = getEpisodeLabels(it)
    const ep = it.Type === 'Episode' ? (labels && labels.full) || it.Name || '' : ''
    const own = panelMediaPills(it)
    const key = `${it._serverUrl || ''}|${it.Id}`
    fetched()
    const pills = own.length ? own : mediaCache.get(key) || []
    const overview = !props.hideOverview && typeof it.Overview === 'string' ? it.Overview.trim() : ''
    return {
      id: it.Id,
      key,
      backdrop: panelBackdrop(it),
      title,
      titleFont: fontFor(title, 'bold'),
      ep,
      epFont: fontFor(ep, 'bold'),
      info: infoParts(it),
      pills: pillsOf(pills),
      wantsPills: !own.length && !!it.Id && it.MediaType === 'Video' && !it._external && !it._seerr && !mediaCache.has(key),
      overview,
      overviewFont: fontFor(overview),
    }
  })
  const contentW = () => (props.w - 2) * 0.54
  // The column's parts top to bottom, centered in the panel. Each text sits as low in its line as
  // Chrome sets it (cssShift).
  const stack = createMemo(() => {
    const v = m()
    if (!v) return null
    let y = titleH()
    const epY = y + 10
    if (v.ep) y = epY + 33
    const infoY = y + (v.ep ? 14 : 16)
    if (v.info.length) y = infoY + 34
    // The ratings line keeps its 8px above even when it draws nothing.
    const ratingsY = y + 8
    y = ratingsY + ratingsH()
    const pillsY = y + 14
    if (v.pills.length) y = pillsY + 43
    const overviewY = y + 20
    if (v.overview) y = overviewY + overviewH()
    const top = 1 + (H - 2 - y) / 2
    return {
      titleY: top + cssShift(66),
      epY: top + epY + cssShift(26),
      infoY: top + infoY + cssShift(21),
      ratingsY: top + ratingsY,
      pillsY: top + pillsY,
      overviewY: top + overviewY + cssShift(20),
    }
  })

  let timer = null
  let pillsFor = ''
  const queuePills = () => {
    const v = m()
    if (!v || !v.wantsPills || !props.rowFocused || (timer && pillsFor === v.key)) return
    clearTimeout(timer)
    pillsFor = v.key
    timer = setTimeout(() => {
      timer = null
      api
        .getItemMediaInfo(v.id)
        .then((full) => {
          rememberMedia(v.key, panelMediaPills(full))
          setFetched(fetched() + 1)
        })
        .catch(() => {})
    }, MEDIA_FETCH_DELAY_MS)
  }
  // A fresh copy of the same title, as a row reload hands over, keeps the fetch already waiting.
  createEffect(
    on([() => m() && m().key, () => !!props.rowFocused], ([key, focused]) => {
      if (timer && (key !== pillsFor || !focused)) {
        clearTimeout(timer)
        timer = null
      }
      queuePills()
    }),
  )
  onCleanup(() => clearTimeout(timer))

  return (
    <view
      x={props.x || 0}
      y={props.y || 0}
      width={props.w}
      height={H}
      alpha={props.alpha === undefined ? 1 : props.alpha}
      zIndex={props.zIndex || 0}
      transition={tx(props.transition)}
    >
      <view>
        <Show when={props.look.panelShadow}>
          <view width={props.w} height={H} borderRadius={28} color="#10121800" shadow={SHADOW} />
        </Show>
      </view>
      <view width={props.w} height={H} borderRadius={28} color={m() ? '#101218ff' : '#ffffff0f'} border={m() ? EDGE_ON : EDGE_EMPTY} />
      {/* Each part that comes and goes keeps its place in a container of its own. */}
      <view>
        <Show when={m() && m().backdrop}>
          <view
            x={1 + (props.w - 2) * 0.3}
            y={1}
            width={(props.w - 2) * 0.7}
            height={554}
            src={m().backdrop}
            textureOptions={BACKDROP}
            borderRadius={[0, 27, 27, 0]}
          />
          <view x={1} y={1} width={props.w - 2} height={554} src={scrimSrc(CAROUSEL_PANEL_SCRIM)} borderRadius={27} />
        </Show>
      </view>
      <Show when={m()}>
        <text
          x={73}
          y={stack().titleY}
          fontFamily={m().titleFont}
          fontSize={66}
          lineHeight={69.3}
          letterSpacing={-1.32}
          maxWidth={contentW()}
          maxLines={2}
          color="#ffffffff"
          onEvent={{ loaded: (_, e) => e && e.type === 'text' && e.dimensions.h && setTitleH(e.dimensions.h) }}
        >
          {m().title}
        </text>
        <text x={73} y={stack().epY} fontFamily={m().epFont} fontSize={26} lineHeight={33} maxWidth={contentW()} maxLines={1} color="#ffffffff">
          {m().ep}
        </text>
        <view x={73} y={stack().infoY} width={contentW()} height={33} clipping>
          {/* By position, so the next title reuses the line's nodes. */}
          <Index each={m().info}>
            {(p) => (
              <view>
                <Show when={p().dotX >= 0}>
                  <text x={p().dotX} fontFamily={dotFont} fontSize={21} lineHeight={33} color="#ffffff73">
                    •
                  </text>
                </Show>
                <Show
                  when={p().chip}
                  fallback={
                    <text x={p().x} fontFamily={p().font} fontSize={21} lineHeight={33} color="#ffffffd6">
                      {p().label}
                    </text>
                  }
                >
                  <view x={p().x} y={2.5} width={p().w} height={28} borderRadius={6} color="#ffffff14" border={PILL_EDGE}>
                    <text x={11} y={4} fontFamily={p().font} fontSize={17} lineHeight={20} color="#ffffffd6">
                      {p().label}
                    </text>
                  </view>
                </Show>
              </view>
            )}
          </Index>
        </view>
        <RatingsRow
          x={73}
          y={stack().ratingsY}
          item={props.item}
          compact
          singleLineWidth={1}
          surface="homeRows"
          pluginEnabled={mdb()}
          maxW={contentW()}
          onLayout={(b) => setRatingsH(b.empty ? 0 : b.h)}
        />
        <view x={73} y={stack().pillsY}>
          <Index each={m().pills}>
            {(p) => (
              <view x={p().x} width={p().w} height={43} borderRadius={6} color="#ffffff14" border={PILL_EDGE}>
                <text x={10} y={6.5} fontFamily="roboto-bold" fontSize={16} lineHeight={33} letterSpacing={0.64} color="#ffffffff">
                  {p().label}
                </text>
              </view>
            )}
          </Index>
        </view>
        <text
          x={73}
          y={stack().overviewY}
          fontFamily={m().overviewFont}
          fontSize={20}
          lineHeight={30}
          maxWidth={Math.min(820, contentW())}
          maxLines={3}
          color="#ffffffcc"
          onEvent={{ loaded: (_, e) => e && e.type === 'text' && e.dimensions.h && setOverviewH(e.dimensions.h) }}
        >
          {m().overview}
        </text>
      </Show>
    </view>
  )
}
