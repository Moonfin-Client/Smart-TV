import { For, Index, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import IncompleteBadge from './IncompleteBadge.jsx'
import LabelSet from './LabelSet.jsx'
import SeerrBanner from './SeerrBanner.jsx'
import { BADGE_SHADOW, DOT_SHADOW, MISSING_SHADOW, SEERR_ICONS, seerrDotLook, serverBadgeW, useMarks } from './ClassicCard.jsx'
import { labelSets } from './cardMarks.js'
import { cssShift, uiFont } from '../../text.js'
import { hex } from '../../color.js'
import { tx } from '../../fx.js'

// One card of a Modern or Carousel row: the poster at rest, and while focused the wide art grown to
// 16:9 once it has loaded. The row owns focus, the width and the focus ring, so a move only changes
// plain props here. While its preview plays (`vid`) the art fades out with its badges, so the video
// under the canvas shows through, and the count, Seerr dot, banner and labels stay on top. Props:
// `card` (cards.js modernCard), `w`, `focused`, `open`, `look`, `carousel`, `dw` (the overview's
// width), `rh` (the ratings' height the row draws under it), `vid`, plus `x`, `ref` and
// `onArtIn(url)`.
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const COVER = { resizeMode: { type: 'cover' } }
const countFont = uiFont('bold')

export default function ModernCard(props) {
  const c = () => props.card
  const L = () => props.look
  const [seen, bump] = useMarks(c)
  const [closing, setClosing] = createSignal(false)
  // Only an animated look eases its widths and corner badges.
  const glide = createMemo(() => (L().openMs ? { duration: L().openMs, easing: EASE } : undefined))
  const slide = createMemo(() => (glide() ? { x: glide() } : undefined))
  const grows = createMemo(() => (glide() ? { width: glide() } : undefined))
  // An animated card holds its wide art to the left edge, so growing uncovers more to the right.
  const wideFit = createMemo(() => (L().openMs ? { resizeMode: { type: 'cover', clipX: 0, clipY: 0.5 } } : COVER))
  const border = () => (L().border.w ? { width: L().border.w, color: hex(L().border.color) } : undefined)
  const radius = () => L().modernRadius

  // Closing, an animated card keeps its wide art while it slides shut under the poster fading back in.
  let closeTimer = null
  createEffect(
    on(
      () => !!props.open,
      (now, was) => {
        clearTimeout(closeTimer)
        setClosing(!now && !!was && L().openMs > 0)
        if (closing()) closeTimer = setTimeout(() => setClosing(false), L().openMs)
      },
      { defer: true },
    ),
  )
  onCleanup(() => clearTimeout(closeTimer))

  const wide = () => ((props.focused || closing()) && c().wide ? c().wide : '')
  // The poster stays up until the renderer has the wide art, so an open card never shows a blank
  // box while its art uploads. Art loaded ahead is in before the next frame, so it swaps as before.
  const [wideIn, setWideIn] = createSignal(false)
  createEffect(on(wide, () => setWideIn(false)))
  const labels = createMemo(() => {
    const s = seen()
    return labelSets(s.badges, c(), c().w, c().h, s.incomplete, bump)
  })
  const countW = () => c().count.length * 12 + 22
  const serverW = () => serverBadgeW(c())
  const top = () => c().h + 8 + L().modernCardTitle * 1.2 + 2 + cssShift(20)
  const lines = () => (props.focused ? c().focusLines : c().restLine ? [c().restLine] : [])
  // The overview under a grown card, below the ratings the row draws for it, reaching to the row's
  // right edge. The section's 8px top margin collapses with its first child's, so the ratings' own
  // margin (inside rh) or the overview's 8px is the only gap above it.
  const sectionY = () => c().h + 8 + L().modernCardTitle * 1.2 + c().focusLines.length * 26
  const extended = () => !props.carousel && props.open && c().overview && !L().hideOverview
  const artIn = () => props.onArtIn && props.onArtIn(c().wide)
  const dot = () => c().seerrDot

  return (
    <view ref={props.ref} x={props.x || 0} width={props.w} height={c().h} transition={tx(slide())}>
      <view alpha={props.vid ? 0 : 1} transition={tx({ alpha: { duration: L().tier === 'high' ? 300 : 0 } })}>
        <Show when={!c().rest}>
          <view width={props.w} height={c().h} borderRadius={radius()} color={L().placeholder} linearGradient={L().placeholderWash} />
          <Show when={c().placeholder === 'name'}>
            <text
              x={12}
              y={c().h / 2}
              mountY={0.5}
              fontFamily={c().nameFont}
              fontSize={20}
              lineHeight={26}
              letterSpacing={3}
              maxWidth={props.w - 24}
              maxLines={4}
              contain="width"
              textAlign="center"
              color="#ffffff80"
            >
              {c().name}
            </text>
          </Show>
          <Show when={c().placeholder === 'person'}>
            <view x={props.w * 0.31} y={c().h * 0.31} width={props.w * 0.38} height={props.w * 0.38} src="icons/person.webp" color="#ffffff73" />
          </Show>
        </Show>
        {/* The wide art comes in over the poster's place but under it, and the poster fades away once it opens. */}
        <view>
          <Show when={wide()}>
            <view
              width={props.w}
              height={c().h}
              src={wide()}
              textureOptions={wideFit()}
              borderRadius={radius()}
              border={border()}
              transition={tx(grows())}
              onEvent={{ loaded: () => (setWideIn(true), artIn()), failed: artIn }}
            />
          </Show>
        </view>
        <Show when={c().rest}>
          <view
            width={c().w}
            height={c().h}
            src={c().rest}
            textureOptions={COVER}
            borderRadius={radius()}
            border={border()}
            alpha={props.open && wideIn() ? 0 : 1}
            transition={tx(glide() ? { alpha: glide() } : undefined)}
          />
        </Show>
        <Show when={c().genre}>
          <view width={props.w} height={c().h} borderRadius={radius()} color="#00000073">
            <text
              x={12}
              y={c().h / 2}
              mountY={0.5}
              fontFamily={c().nameFont}
              fontSize={26}
              lineHeight={33}
              letterSpacing={3.9}
              maxWidth={props.w - 24}
              contain="width"
              textAlign="center"
              color="#ffffffe6"
            >
              {c().genre}
            </text>
          </view>
        </Show>
        <Show when={c().progress > 0}>
          <view x={6} y={c().h - 18} width={props.w - 12} height={12} borderRadius={6} color={L().progressBg} transition={tx(grows())}>
            <view width={(props.w - 12) * c().progress} height={12} borderRadius={6} color={L().accent} transition={tx(grows())} />
          </view>
        </Show>
        <Show when={c().serverName}>
          <view
            x={props.w - 8 - serverW()}
            y={c().topY}
            width={serverW()}
            height={c().source ? 22 : 31}
            borderRadius={4}
            color={L().surface}
            transition={tx(slide())}
          >
            <text
              x={c().source ? 8 : 10}
              y={4}
              fontFamily={countFont}
              fontSize={c().source ? 12 : 18}
              lineHeight={c().source ? 14 : 23}
              maxWidth={serverW() - (c().source ? 16 : 20)}
              maxLines={1}
              color={L().onSurface}
            >
              {c().serverName}
            </text>
          </view>
        </Show>
        <Show when={c().played}>
          <view
            x={props.w - 36}
            y={c().cornerY}
            width={28}
            height={28}
            borderRadius={14}
            color={L().watched}
            border={{ width: 1, color: hex(L().onBadge) }}
            shadow={BADGE_SHADOW}
            transition={tx(slide())}
          >
            <view x={6.5} y={6.5} width={15} height={15} src="icons/watched_check.webp" color={L().onBadge} />
          </view>
        </Show>
        <Show when={c().fav}>
          <view x={8} y={c().topY} width={28} height={28} borderRadius={14} color={L().fav} border={{ width: 1, color: hex(L().onBadge) }} shadow={BADGE_SHADOW}>
            <view x={7} y={7} width={14} height={14} src="icons/favorite.webp" color={L().onBadge} />
          </view>
        </Show>
        <Show when={c().seerrMissing}>
          <view x={props.w - 30} y={c().cornerY} width={22} height={22} borderRadius={11} color={L().accent} shadow={MISSING_SHADOW} transition={tx(slide())}>
            <view x={4} y={4} width={14} height={14} src="icons/nav_seerr.webp" color={L().onBadge} />
          </view>
        </Show>
      </view>
      <Show when={!props.carousel}>
        <text
          y={c().h + 8 + cssShift(L().modernCardTitle)}
          fontFamily={c().titleFont}
          fontSize={L().modernCardTitle}
          lineHeight={L().modernCardTitle * 1.2}
          maxWidth={props.w}
          maxLines={1}
          color={L().title}
        >
          {c().title}
        </text>
      </Show>
      <view>
        <Index each={lines()}>
          {(text, i) => (
            <text y={top() + i * 26} fontFamily={c().restLineFont} fontSize={20} lineHeight={24} maxWidth={props.w} maxLines={1} color={L().secondary}>
              {text()}
            </text>
          )}
        </Index>
      </view>
      <view>
        <Show when={extended()}>
          <text
            y={sectionY() + (props.rh ? props.rh + 8 : 8) + cssShift(20)}
            fontFamily={c().overviewFont}
            fontSize={20}
            lineHeight={27}
            maxWidth={props.dw}
            maxLines={3}
            color={L().overview}
          >
            {c().overview}
          </text>
        </Show>
      </view>
      <Show when={c().count}>
        <view
          x={props.w - 8 - countW()}
          y={c().cornerY}
          width={countW()}
          height={31}
          borderRadius={16}
          color={L().unplayed}
          border={{ width: 1.5, color: hex(L().onBadge) }}
          transition={tx(slide())}
        >
          <text x={countW() / 2} y={3.5} mountX={0.5} fontFamily={countFont} fontSize={20} lineHeight={28} color={L().onBadge}>
            {c().count}
          </text>
        </view>
      </Show>
      <Show when={dot()}>
        <view
          x={props.w - 43}
          y={c().serverName ? c().cornerY : 10}
          width={33}
          height={33}
          borderRadius={16.5}
          color={seerrDotLook(dot()).fill}
          border={{ width: 2.5, color: hex(seerrDotLook(dot()).ring) }}
          shadow={DOT_SHADOW}
          transition={tx(slide())}
        >
          <view
            x={4.6}
            y={4.6}
            width={23.8}
            height={23.8}
            src={'icons/' + (SEERR_ICONS[dot()] || 'checkRounded') + '.webp'}
            color={seerrDotLook(dot()).ink}
          />
        </view>
      </Show>
      <Show when={c().banner}>
        <SeerrBanner w={props.w} h={c().h} card={c()} inset={props.focused ? 4 : L().border.w} radius={L().classicRadius} modern ms={L().openMs} />
      </Show>
      <view>
        <Show when={seen().incomplete}>
          <IncompleteBadge x={8} y={(c().fav ? 32 : 0) + (c().banner ? 28 : 8)} />
        </Show>
      </view>
      <view>
        <For each={labels()}>{(ls) => <LabelSet x={ls.right ? props.w - c().w : 0} transition={tx(slide())} w={c().w} h={c().h} nodes={ls.nodes} />}</For>
      </view>
    </view>
  )
}
