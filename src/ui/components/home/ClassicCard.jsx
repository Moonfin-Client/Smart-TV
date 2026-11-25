import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js'
import LoopMarquee from './LoopMarquee.jsx'
import IncompleteBadge from './IncompleteBadge.jsx'
import LabelSet from './LabelSet.jsx'
import SeerrBanner from './SeerrBanner.jsx'
import { labelSets, watchMarks } from './cardMarks.js'
import { cssShift, uiFont } from '../../text.js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { tx } from '../../fx.js'

// One card of a Classic row: the row's artwork in its own shape, the title and a detail line under
// it that scroll while focused when they don't fit, and with Card Focus Zoom a 5 percent grow on
// focus. The row owns focus. While its preview plays (`vid`) the card drops its zoom and the art
// fades out with its badges, so the video under the canvas shows.
// Props: `card` (cards.js classicCard), `focused`, `look` (look.js homeLook), `vid`, `x`, `ref`.

export const SEERR_COLORS = { available: '#22c55eff', partial: '#22c55eff', processing: '#9333eaff', pending: '#eab308ff' }
export const SEERR_ICONS = { available: 'checkRounded', partial: 'removeRounded', processing: 'scheduleRounded', pending: 'scheduleRounded' }
export const BADGE_SHADOW = { color: shadowColor('#0000004d'), x: 0, y: 1.5, blur: 4, spread: 0 }
export const DOT_SHADOW = { color: shadowColor('#0000004d'), x: 0, y: 2.5, blur: 7, spread: 0 }
export const MISSING_SHADOW = { color: shadowColor('#00000033'), x: 0, y: 1, blur: 3, spread: 0 }
const COVER = { resizeMode: { type: 'cover' } }
const CONTAIN = { resizeMode: { type: 'contain' } }
const countFont = uiFont('bold')

// What cardMarks hears after a card is built: an incomplete recording and the poster labels. A
// fresh copy of the same title, as a row reload hands over, keeps what it already heard. Gives the
// marks and a bump for a label's flag that loads later.
export const useMarks = (card) => {
  const [marks, setMarks] = createSignal(0)
  const bump = () => setMarks((n) => n + 1)
  let watcher = watchMarks(untrack(card), bump)
  createEffect(
    on(
      card,
      (now, was) => {
        if (was && now.labelsId === was.labelsId && (now.raw && now.raw.Id) === (was.raw && was.raw.Id)) return
        watcher.stop()
        watcher = watchMarks(now, bump)
        bump()
      },
      { defer: true },
    ),
  )
  onCleanup(() => watcher.stop())
  // Not deduplicated, since a flag coming in changes the labels without changing what was heard.
  const seen = createMemo(
    () => {
      marks()
      return watcher.read()
    },
    undefined,
    { equals: false },
  )
  return [seen, bump]
}

export const serverBadgeW = (c) => {
  const size = c.source ? 12 : 18
  return Math.min(c.source ? 120 : 180, c.serverName.length * size * 0.55 + (c.source ? 16 : 20))
}

export default function ClassicCard(props) {
  const c = () => props.card
  const L = () => props.look
  const [seen, bump] = useMarks(c)
  const radius = () => (c().circle ? c().w / 2 : L().classicRadius)
  const labels = createMemo(() => {
    const s = seen()
    return labelSets(s.badges, c(), c().w, c().h, s.incomplete, bump)
  })
  const countW = () => c().count.length * 12 + 22
  const serverW = () => serverBadgeW(c())
  const plainLines = () => {
    const card = c()
    if (!card.plain) return []
    const out = [{ k: 'p1', text: card.line1, font: card.line1Font, size: 20, y: card.h + 10 + cssShift(20), color: L().title }]
    if (card.line2) {
      const y = card.h + 10 + 33 + (card.line1Font.indexOf('bold') >= 0 ? 4 : 0) + cssShift(16)
      out.push({ k: 'p2', text: card.line2, font: card.line2Font, size: 16, y, color: L().secondary })
    }
    return out
  }
  const dot = () => c().seerrDot
  const left = () => c().seerrLeft
  return (
    <view
      ref={props.ref}
      x={props.x || 0}
      width={c().w}
      height={c().h}
      pivot={0.5}
      zIndex={props.focused ? 10 : 0}
      scale={props.focused && L().zoom && !props.vid ? 1.05 : 1}
      transition={{ scale: { duration: 150, easing: 'ease-out' } }}
    >
      <view alpha={props.vid ? 0 : 1} transition={tx({ alpha: { duration: L().tier === 'high' ? 300 : 0 } })}>
        <Show
          when={c().image}
          fallback={
            <>
              <view width={c().w} height={c().h} borderRadius={radius()} color={L().placeholder} linearGradient={L().placeholderWash} />
              <text
                x={12}
                y={c().h / 2}
                mountY={0.5}
                fontFamily={c().nameFont}
                fontSize={20}
                lineHeight={26}
                letterSpacing={3}
                maxWidth={c().w - 24}
                maxLines={4}
                contain="width"
                textAlign="center"
                color="#ffffff80"
              >
                {c().name}
              </text>
            </>
          }
        >
          <view
            width={c().w}
            height={c().h}
            src={c().image}
            textureOptions={c().contain ? CONTAIN : COVER}
            borderRadius={radius()}
            border={L().border.w ? { width: L().border.w, color: hex(L().border.color) } : undefined}
          />
        </Show>
        <Show when={c().genre}>
          <view width={c().w} height={c().h} borderRadius={radius()} color="#00000073">
            <text
              x={12}
              y={c().h / 2}
              mountY={0.5}
              fontFamily={c().nameFont}
              fontSize={c().genreSize}
              lineHeight={33}
              letterSpacing={c().genreSize * 0.18}
              maxWidth={c().w - 24}
              contain="width"
              textAlign="center"
              color="#ffffffe6"
            >
              {c().genre}
            </text>
          </view>
        </Show>
        <Show when={c().progress > 0}>
          <view x={6} y={c().h - 18} width={c().w - 12} height={12} borderRadius={6} color={L().progressBg}>
            <view width={(c().w - 12) * c().progress} height={12} borderRadius={6} color={L().accent} />
          </view>
        </Show>
        <Show when={c().serverName}>
          <view x={c().w - 8 - serverW()} y={c().topY} width={serverW()} height={c().source ? 22 : 31} borderRadius={4} color={L().surface}>
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
            x={c().w - 36}
            y={c().cornerY}
            width={28}
            height={28}
            borderRadius={14}
            color={L().watched}
            border={{ width: 1, color: hex(L().onBadge) }}
            shadow={BADGE_SHADOW}
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
          <view x={c().w - 30} y={c().cornerY} width={22} height={22} borderRadius={11} color={L().accent} shadow={MISSING_SHADOW}>
            <view x={4} y={4} width={14} height={14} src="icons/nav_seerr.webp" color={L().onBadge} />
          </view>
        </Show>
      </view>
      <Show when={!c().plain}>
        <LoopMarquee
          y={c().h + 16}
          text={c().line1}
          font={c().line1Font}
          weight="bold"
          size={22}
          lh={30}
          ink={L().title}
          width={c().w}
          active={props.focused}
        />
        <Show when={c().line2}>
          <LoopMarquee
            y={c().h + 46}
            text={c().line2}
            font={c().line2Font}
            size={20}
            lh={28}
            ink={L().classicSecondary}
            width={c().w}
            active={props.focused}
          />
        </Show>
      </Show>
      <For each={plainLines()}>
        {(pl) => (
          <text
            y={pl.y}
            fontFamily={pl.font}
            fontSize={pl.size}
            lineHeight={33}
            maxWidth={c().w}
            maxLines={1}
            contain="width"
            textAlign="center"
            color={pl.color}
          >
            {pl.text}
          </text>
        )}
      </For>
      <Show when={c().count}>
        <view
          x={c().w - 8 - countW()}
          y={c().cornerY}
          width={countW()}
          height={31}
          borderRadius={16}
          color={L().unplayed}
          border={{ width: 1.5, color: hex(L().onBadge) }}
        >
          <text x={countW() / 2} y={3.5} mountX={0.5} fontFamily={countFont} fontSize={20} lineHeight={28} color={L().onBadge}>
            {c().count}
          </text>
        </view>
      </Show>
      <Show when={dot()}>
        <view
          x={c().w - 43}
          y={c().serverName ? c().cornerY : 10}
          width={33}
          height={33}
          borderRadius={16.5}
          color={dot() === 'partial' ? '#22c55eff' : '#ffffffff'}
          border={{ width: 2.5, color: hex(SEERR_COLORS[dot()] || '#ffffffff') }}
          shadow={DOT_SHADOW}
        >
          <view
            x={4.6}
            y={4.6}
            width={23.8}
            height={23.8}
            src={'icons/' + (SEERR_ICONS[dot()] || 'checkRounded') + '.webp'}
            color={dot() === 'partial' ? '#ffffffff' : SEERR_COLORS[dot()] || '#ffffffff'}
          />
        </view>
      </Show>
      <Show when={left()}>
        <view
          x={8}
          y={8}
          width={28}
          height={28}
          borderRadius={14}
          color={left() === 'partial' ? '#22c55eff' : '#ffffffff'}
          border={{ width: 2.5, color: hex(SEERR_COLORS[left()] || '#ffffffff') }}
          shadow={DOT_SHADOW}
        >
          <view
            x={3.9}
            y={3.9}
            width={20.2}
            height={20.2}
            src={'icons/' + (SEERR_ICONS[left()] || 'checkRounded') + '.webp'}
            color={left() === 'partial' ? '#ffffffff' : SEERR_COLORS[left()] || '#ffffffff'}
          />
        </view>
      </Show>
      <view
        width={c().w}
        height={c().h}
        borderRadius={radius()}
        color="#00000000"
        border={{ width: 4, color: hex(L().focus) }}
        alpha={props.focused ? 1 : 0}
        transition={tx({ alpha: { duration: L().borderMs } })}
      />
      <Show when={c().banner}>
        <SeerrBanner w={c().w} h={c().h} card={c()} inset={props.focused ? 4 : L().border.w} radius={radius()} ms={0} />
      </Show>
      {/* Marks arrive after the card has drawn, so each keeps its place in a container of its own. */}
      <view>
        <Show when={seen().incomplete}>
          <IncompleteBadge x={8} y={(c().fav ? 32 : 0) + (c().banner ? 28 : 8)} />
        </Show>
      </view>
      <view>
        <For each={labels()}>{(ls) => <LabelSet w={c().w} h={c().h} nodes={ls.nodes} />}</For>
      </view>
    </view>
  )
}
