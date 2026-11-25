import { For, Show, createMemo, createSignal } from 'solid-js'
import { cssShift, uiFont } from '../../text.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import RatingsRow from '../home/RatingsRow.jsx'
import HomePreview from './HomePreview.jsx'
import MediaBarLogo, { MediaBarRelease, RELEASE_H } from './mediaBarLogo.jsx'
import { dotsLayout } from './mediaBarKit.js'
import { COVER, artColor, runtimeText } from './kit.js'
import { SAMPLE_RATINGS, ratedSample } from './sampleRatings.js'

// The Banner bar preview: a 320 tall banner with the art darkened from the left, the logo, facts
// and ratings along its foot and the slide marks top right, and Home's modern rows under it.
const ROWS_PICK = { kind: 'rows', modern: true }
const META_SHIFT = cssShift(12)

export default function MediaBarBanner(props) {
  const [ratingsH, setRatingsH] = createSignal(0)
  const semi = uiFont('bold')
  const item = () => props.items[0]
  const meta = () => {
    const it = item()
    const parts = []
    if (it.year) parts.push(String(it.year))
    if (it.runtimeMinutes) parts.push(runtimeText(it.runtimeMinutes))
    if (it.officialRating) parts.push(it.officialRating)
    return parts.join(' · ')
  }
  // The block stacked up from 16 above the banner's foot: ratings, facts, label and logo.
  const block = createMemo(() => {
    const rel = !!item().newRelease
    const top = 304 - (56 + (rel ? 8 + RELEASE_H : 0) + 6 + 33 + ratingsH())
    const metaY = top + 56 + (rel ? 8 + RELEASE_H : 0) + 6
    return { top, relY: top + 64, metaY, ratingsY: metaY + 33 }
  })
  const rated = createMemo(() => ratedSample(item()))
  const dots = createMemo(() => {
    const d = dotsLayout(props.s.featuredItemCount, { max: 7, active: 16, inactive: 6, gap: 2, pill: true })
    return { x: 936 - 16 - d.w, marks: d.marks }
  })
  return (
    <view width={960} height={540}>
      <view x={24} width={912} height={320} borderRadius={14} src={item().backdropUrl || ''} textureOptions={COVER} color={artColor(item().backdropUrl, props.t)} />
      <view x={24} width={912} height={320} borderRadius={14} colorLeft="#000000e6" colorRight="#00000000" />
      <view x={44} width={892} height={320}>
        <MediaBarLogo y={block().top} w={240} h={56} align="bottomLeft" url={item().logoUrl} title={item().title} size={22} weight="bold" lh={33} ink={props.t.onSurface} />
        <view>
          <Show when={item().newRelease}>
            <MediaBarRelease y={block().relY} />
          </Show>
        </view>
        <text fontFamily={semi} fontSize={12} lineHeight={33} y={block().metaY + META_SHIFT} color={props.t.onSurfaceA(0.75)}>
          {meta()}
        </text>
        <RatingsRow
          y={block().ratingsY}
          item={rated()}
          surface="mediaBar"
          compact
          labels={false}
          badges={false}
          sampleRatings={SAMPLE_RATINGS}
          pluginEnabled={isMdblistEnabled(props.s, 'mediaBar')}
          zoom={0.5}
          maxW={1744}
          prefs={props.s}
          onLayout={(b) => setRatingsH(b.empty ? 0 : b.h)}
        />
      </view>
      <view x={dots().x} y={12}>
        <For each={dots().marks}>
          {(d) => <view x={d.x} y={d.y} width={d.w} height={d.h} borderRadius={d.r} color={d.first ? props.t.onSurface : props.t.onSurfaceA(0.4)} />}
        </For>
      </view>
      <view y={328} width={960} height={212} clipping>
        <HomePreview s={props.s} items={props.items} pick={ROWS_PICK} />
      </view>
    </view>
  )
}
