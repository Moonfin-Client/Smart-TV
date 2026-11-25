import { For, Show, createMemo, createSignal } from 'solid-js'
import { cssShift, fontFor, uiFont } from '../../text.js'
import { isMdblistEnabled } from '../../../services/mdblistApi.js'
import RatingsRow from '../home/RatingsRow.jsx'
import MediaBarLogo, { MediaBarRelease } from './mediaBarLogo.jsx'
import { dotsLayout, metaLayout } from './mediaBarKit.js'
import { COVER, artColor, borderOf, lineCount, metaParts } from './kit.js'
import { SAMPLE_RATINGS, ratedSample } from './sampleRatings.js'

// The Moonfin bar preview: the first title's backdrop over the screen, its logo top left, a panel
// along the bottom with its facts, ratings and overview, the slide marks under it and an arrow either
// side. [peek] is the room Home's first row takes along the bottom.
const INNER_W = 878

export default function MediaBarMoonfin(props) {
  const [ratingsH, setRatingsH] = createSignal(0)
  const semi = uiFont('bold')
  const item = () => props.items[0]
  const meta = createMemo(() => metaLayout(metaParts(item()), item().officialRating, INNER_W))
  const rated = createMemo(() => ratedSample(item()))
  const overview = () => item().overview || ''
  const panel = createMemo(() => {
    const lines = overview() ? Math.min(3, lineCount(overview(), 14, 'regular', INNER_W)) : 0
    const innerH = meta().h + ratingsH() + (lines ? 8 + lines * 19.6 : 0)
    const h = innerH + 24 + 2 * props.t.cardBorder.w
    return { h, y: 540 - (props.peek || 0) - 36 - h, ratingsY: meta().h, overviewY: meta().h + ratingsH() + 8 + cssShift(14) }
  })
  const dots = createMemo(() => dotsLayout(props.s.featuredItemCount, { active: 10, inactive: 8, gap: 4 }))
  const dotsBox = () => {
    const w = dots().w + 24
    return { x: (960 - w) / 2, y: 540 - (props.peek || 0) - 8 - 22, w }
  }
  const arrowY = () => (540 - (props.peek || 0)) / 2 - 25
  const border = () => borderOf(props.t.cardBorder)
  const bw = () => props.t.cardBorder.w
  const arrow = (x, icon) => (
    <view x={x} y={arrowY()} width={50} height={50} borderRadius={25} color={props.t.scrimA(0.4)} border={border()}>
      <view x={11} y={11} width={28} height={28} src={icon} color={props.t.onSurfaceA(0.9)} />
    </view>
  )
  return (
    <view width={960} height={540}>
      <view width={960} height={540} src={item().backdropUrl || ''} textureOptions={COVER} color={artColor(item().backdropUrl, props.t)} />
      <MediaBarLogo x={40} y={56} w={280} h={120} align="bottomLeft" url={item().logoUrl} title={item().title} size={28} weight="bold" lh={29.4} ink={props.t.onSurface} />
      <view>
        <Show when={item().newRelease}>
          <MediaBarRelease x={40} y={184} />
        </Show>
      </view>
      <view x={24} y={panel().y} width={912} height={panel().h} borderRadius={16} color={props.t.overlayA(0.75)} border={border()}>
        <view x={16 + bw()} y={12 + bw()} width={INNER_W} height={panel().h}>
          <view>
            <For each={meta().chips}>
              {(c) => <view x={c.x} y={c.y} width={c.w} height={c.h} borderRadius={3} color="#00000000" border={borderOf(props.t.chipBorder)} />}
            </For>
          </view>
          <view>
            <For each={meta().texts}>
              {(m) => (
                <text fontFamily={semi} fontSize={m.size} lineHeight={33} x={m.x} y={m.y} color={props.t.onSurfaceA(0.9)}>
                  {m.text}
                </text>
              )}
            </For>
          </view>
          <RatingsRow
            y={panel().ratingsY}
            item={rated()}
            surface="mediaBar"
            compact
            sampleRatings={SAMPLE_RATINGS}
            pluginEnabled={isMdblistEnabled(props.s, 'mediaBar')}
            zoom={0.5}
            maxW={1756}
            prefs={props.s}
            onLayout={(b) => setRatingsH(b.empty ? 0 : b.h)}
          />
          <text
            fontFamily={fontFor(overview())}
            fontSize={14}
            lineHeight={19.6}
            y={panel().overviewY}
            maxWidth={INNER_W}
            maxLines={3}
            color={props.t.onSurfaceA(0.9)}
          >
            {overview()}
          </text>
        </view>
      </view>
      <view x={dotsBox().x} y={dotsBox().y} width={dotsBox().w} height={22} borderRadius={12} color={props.t.scrimA(0.55)}>
        <view x={12} y={6}>
          <For each={dots().marks}>
            {(d) => <view x={d.x} y={d.y} width={d.w} height={d.h} borderRadius={d.r} color={d.first ? props.t.onSurface : props.t.onSurfaceA(0.5)} />}
          </For>
        </view>
      </view>
      {arrow(8, 'icons/preview/chevron_left.webp')}
      {arrow(902, 'icons/preview/chevron_right.webp')}
    </view>
  )
}
