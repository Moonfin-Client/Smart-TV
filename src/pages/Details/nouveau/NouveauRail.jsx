import { For, createEffect, createMemo, createSelector, createSignal, on } from 'solid-js'
import { uiFont } from '../../../ui/text.js'
import { hex } from '../../../ui/color.js'
import { holdPress } from '../../../utils/longPress.js'
import { byKey } from '../../../ui/components/details/keyed.js'
import StillLabels from '../../../ui/components/details/StillLabels.jsx'
import { railShift } from './geometry.js'
import { pointerFocus } from '../../../app/pointer.js'

// One Nouveau rail: a heading and a track of cards clipped to the page's width, which slides to keep
// the focused card 50px clear of either edge.
//
// Props: `rail` (from rails.js), `view` (the track's width), `tokens`, `x`, `y`. Left off the first
// card calls onRailEdge(node, 'left'), which hands it to a docked nav or wraps to the last card
// (node.wrap()), and Right off the last wraps to the first, but an episode's artwork stays. Enter
// calls onRailSelect(rail, card, half) and a held Enter on a rail with a menu calls
// onRailLong(rail, card). Every move calls onRailFocus(rail, card). Only the cards near the visible
// track are built. Its node has current(), count(), go(i), wrap(), half() and reset().
const WINDOW = 600
const NO_RAIL = { cards: [], title: '', titleFont: 'roboto', trackY: 0, trackH: 40, h: 0, total: 0, startIndex: 0 }
const GONE = {
  k: '',
  idx: -1,
  kind: '',
  x: 0,
  w: 0,
  h: 0,
  artW: 0,
  artH: 0,
  image: '',
  placeholder: '',
  placeholderFont: 'roboto',
  progress: 0,
  title: '',
  titleFont: 'roboto',
  subtitle: '',
  subtitleFont: 'roboto',
  subtitleY: 0,
  nextUp: false,
  nextUpW: 0,
  nextUpLabel: '',
  item: null,
  detailsY: 0,
  detailsH: 0,
  overview: '',
  overviewFont: 'roboto',
  avatar: 0,
  avatarX: 0,
  name: '',
  nameFont: 'roboto',
  nameY: 0,
  role: '',
  roleFont: 'roboto',
  roleY: 0,
  initial: '',
  author: '',
  authorFont: 'roboto',
  meta: '',
  preview: '',
  previewFont: 'roboto',
}
const EDGE = hex('#ffffff14')
const PERSON_EDGE = hex('#ffffff1a')
const DETAILS_EDGE = hex('#ffffff1c')
const COVER = { resizeMode: { type: 'cover' } }
const SLIDE = { x: { duration: 200, easing: 'ease-out' } }

export default function NouveauRail(props) {
  const [cur, setCur] = createSignal(0)
  const [shift, setShift] = createSignal(0)
  const [focused, setFocused] = createSignal(false)
  const r = () => props.rail || NO_RAIL
  const w = () => props.view || 1688
  const t = () => props.tokens || { focus: '#00a4dcff', accent: '#0a84ffff' }
  const ring = () => hex(t().focus)
  const bold = () => uiFont('bold')
  const regular = () => uiFont('regular')
  const isFocus = createSelector(() => (focused() ? cur() : -1))
  // An episode card has two halves: the artwork plays it and the block under it opens it. Only the
  // wrap off the first card reaches a block, the blocks then step along, and Right off the last
  // block wraps to the first artwork.
  const [half, setHalf] = createSignal('art')
  const wide = () => r().cards.length > 0 && r().cards[0].kind === 'landscape'
  const trackW = () => Math.max(r().total, w())
  const cardH = () => Math.max(0, r().trackH - 40)

  const shown = createMemo(() => {
    const from = shift() - WINDOW
    const to = shift() + w() + WINDOW
    return r().cards.filter((c) => c.x + c.w >= from && c.x <= to)
  })
  const of = (kinds) => byKey(() => shown().filter((c) => kinds.indexOf(c.kind) >= 0), GONE)
  const posters = of(['poster', 'still'])
  const landscapes = of(['landscape'])
  const people = of(['person'])
  const reviews = of(['review'])

  const current = () => r().cards[cur()]
  const reveal = () => {
    const c = current()
    if (c) setShift(railShift(shift(), c.kind === 'landscape' && half() === 'art' ? { x: c.x, w: c.w + 2 } : c, w(), r().total))
  }
  const notify = () => {
    const c = current()
    if (c && props.onRailFocus) props.onRailFocus(props.rail, c)
  }
  const go = (i) => {
    setCur(i)
    reveal()
    notify()
  }
  // The rail slides to its focused card, so the Magic Remote's cursor rings a card and a click focuses
  // it and opens it (app/pointer.js).
  const pick = (list, i) => {
    const c = list.at(list.keys()[i])
    if (!c) return false
    pointerFocus(node)
    if (c.idx !== cur()) go(c.idx)
    return true
  }
  // A rail starts on its start card, scrolled so it sits 50px in.
  const reset = () => {
    setHalf('art')
    setCur(Math.max(0, Math.min(r().startIndex || 0, r().cards.length - 1)))
    setShift(0)
    reveal()
  }
  createEffect(
    on(r, (rail) => {
      const n = rail.cards.length
      if (cur() >= n) setCur(Math.max(0, n - 1))
    }),
  )

  // A rail with a menu opens it when Enter is held, so its cards act on release.
  const hold = holdPress()
  let node = null

  return (
    <view
      ref={(n) => {
        node = n
        n.current = current
        n.count = () => r().cards.length
        n.go = go
        n.reset = reset
        n.half = half
        n.wrap = () => {
          if (wide()) setHalf('details')
          go(r().cards.length - 1)
        }
        if (props.ref) props.ref(n)
      }}
      x={props.x || 0}
      y={props.y || 0}
      width={w()}
      height={r().h}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) {
          reveal()
          notify()
        } else {
          hold.cancel()
        }
      }}
      onLeft={() => {
        if (cur() > 0) go(cur() - 1)
        else if (half() === 'art' && props.onRailEdge) props.onRailEdge(node, 'left')
        return true
      }}
      onRight={() => {
        const n = r().cards.length
        if (cur() < n - 1) go(cur() + 1)
        else if (half() === 'details') {
          setHalf('art')
          go(0)
        } else if (n && !wide()) go(0)
        return true
      }}
      onEnter={() => {
        const c = current()
        if (!c) return true
        if (!r().menu) {
          if (props.onRailSelect) props.onRailSelect(props.rail, c, half())
          return true
        }
        hold.start(c, () => {
          if (props.onRailLong) props.onRailLong(props.rail, c)
        })
        return true
      }}
      onMenu={() => {
        const c = current()
        if (!c || !r().menu || !props.onRailLong) return false
        props.onRailLong(props.rail, c)
        return true
      }}
      onEnterRelease={() => {
        return hold.end((c) => {
          if (props.onRailSelect) props.onRailSelect(props.rail, c, half())
        })
      }}
    >
      <text y={3} fontFamily={r().titleFont} fontSize={30} lineHeight={33} color="#ffffffff">
        {r().title}
      </text>
      <view y={r().trackY} width={w()} height={r().trackH} clipping>
        <view transition={SLIDE} x={-shift()} y={20} width={trackW()} height={cardH()}>
          <view width={trackW()} height={cardH()} pointerChildRing onPointerChildClick={(i) => pick(posters, i)}>
            <For each={posters.keys()}>
              {(k) => {
                const c = () => posters.at(k)
                return (
                  <view x={c().x} width={c().w} height={c().h}>
                    <view width={c().w} height={c().h} borderRadius={16} color="#00000001" border={{ width: 1, color: EDGE }} />
                    <view x={1} y={1} width={c().artW} height={c().artH} borderRadius={[15, 15, 0, 0]} color="#ffffff0a" />
                    <text
                      alpha={c().image ? 0 : 1}
                      x={1}
                      y={1 + c().artH / 2 - 9}
                      fontFamily={c().placeholderFont}
                      fontSize={15}
                      lineHeight={18}
                      letterSpacing={1}
                      maxWidth={c().artW}
                      maxLines={1}
                      textAlign="center"
                      contain="width"
                      color="#ffffff59"
                    >
                      {c().placeholder}
                    </text>
                    <view
                      alpha={c().image || c().placeholder ? 0 : 0.3}
                      x={1 + c().artW / 2 - 21}
                      y={1 + c().artH / 2 - 21}
                      width={42}
                      height={42}
                      src="icons/d/series.webp"
                      color="#ffffffff"
                    />
                    <view
                      alpha={c().image ? 1 : 0}
                      x={1}
                      y={1}
                      width={c().artW}
                      height={c().artH}
                      borderRadius={[15, 15, 0, 0]}
                      src={c().image || undefined}
                      textureOptions={COVER}
                    />
                    <view alpha={c().progress > 0 ? 1 : 0} x={1} y={1 + c().artH - 4} width={c().artW} height={4} color="#ffffff40">
                      <view width={c().artW * c().progress} height={4} color={t().accent} />
                    </view>
                    <text
                      x={1}
                      y={c().artH + 11 + 1.5}
                      fontFamily={c().titleFont}
                      fontSize={17}
                      lineHeight={33}
                      maxWidth={c().artW}
                      maxLines={1}
                      color="#ffffffff"
                    >
                      {c().title}
                    </text>
                    <text
                      x={1}
                      y={c().subtitleY + 1.5}
                      fontFamily={c().subtitleFont}
                      fontSize={15}
                      lineHeight={33}
                      maxWidth={c().artW}
                      maxLines={1}
                      color="#ffffffa6"
                    >
                      {c().subtitle}
                    </text>
                    <view
                      alpha={isFocus(c().idx) ? 1 : 0}
                      width={c().w}
                      height={c().h}
                      borderRadius={16}
                      color="#00000001"
                      border={{ width: 1, color: ring() }}
                    />
                  </view>
                )
              }}
            </For>
          </view>
          <view width={trackW()} height={cardH()} pointerChildRing onPointerChildClick={(i) => pick(landscapes, i)}>
            <For each={landscapes.keys()}>
              {(k) => {
                const c = () => landscapes.at(k)
                return (
                  <view x={c().x} width={c().w} height={c().h}>
                    <view width={c().w + 2} height={c().artH + 2} borderRadius={16} color="#00000001" border={{ width: 1, color: EDGE }} />
                    <view x={1} y={1} width={c().artW} height={c().artH} borderRadius={15} color="#ffffff0a" />
                    <text
                      alpha={c().image ? 0 : 1}
                      x={1}
                      y={1 + c().artH / 2 - 9}
                      fontFamily={c().titleFont}
                      fontSize={15}
                      lineHeight={18}
                      maxWidth={c().artW}
                      maxLines={1}
                      textAlign="center"
                      contain="width"
                      color="#ffffff59"
                    >
                      {c().title}
                    </text>
                    <view
                      alpha={c().image ? 1 : 0}
                      x={1}
                      y={1}
                      width={c().artW}
                      height={c().artH}
                      borderRadius={15}
                      src={c().image || undefined}
                      textureOptions={COVER}
                    />
                    <view alpha={c().progress > 0 ? 1 : 0} x={1} y={1 + c().artH - 4} width={c().artW} height={4} color="#ffffff40">
                      <view width={c().artW * c().progress} height={4} color={t().accent} />
                    </view>
                    <view alpha={c().nextUp ? 1 : 0} x={9} y={9} width={c().nextUpW} height={39} borderRadius={19.5} color={t().accent}>
                      <text x={10} y={4.5} fontFamily={bold()} fontSize={13} lineHeight={33} color="#000000ff">
                        {c().nextUpLabel}
                      </text>
                    </view>
                    <StillLabels x={1} y={1} w={c().artW} h={c().artH} item={c().item} top={c().nextUp ? 36 : 8} />
                    <view
                      alpha={isFocus(c().idx) && half() === 'art' ? 1 : 0}
                      width={c().w + 2}
                      height={c().artH + 2}
                      borderRadius={16}
                      color="#00000001"
                      border={{ width: 1, color: ring() }}
                    />
                    <view
                      y={c().detailsY}
                      width={c().w}
                      height={c().detailsH}
                      borderRadius={16}
                      color={isFocus(c().idx) && half() === 'details' ? '#0b0d10f5' : '#0b0d10e0'}
                      border={{ width: 1, color: DETAILS_EDGE }}
                    />
                    <view
                      alpha={isFocus(c().idx) && half() === 'details' ? 1 : 0}
                      y={c().detailsY}
                      width={c().w}
                      height={c().detailsH}
                      borderRadius={16}
                      color="#00000001"
                      border={{ width: 1, color: ring() }}
                    />
                    <text
                      x={17}
                      y={c().detailsY + 15 + 1.5}
                      fontFamily={c().titleFont}
                      fontSize={18}
                      lineHeight={20.7}
                      maxWidth={c().w - 34}
                      maxLines={1}
                      color="#ffffffff"
                    >
                      {c().title}
                    </text>
                    <text
                      x={17}
                      y={c().detailsY + 15 + 20.7 + 7 + 1.5}
                      fontFamily={c().overviewFont}
                      fontSize={15}
                      lineHeight={20.25}
                      maxWidth={c().w - 34}
                      maxLines={2}
                      color="#ffffff9e"
                    >
                      {c().overview}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
          <view width={trackW()} height={cardH()} pointerChildRing onPointerChildClick={(i) => pick(people, i)}>
            <For each={people.keys()}>
              {(k) => {
                const c = () => people.at(k)
                const d = () => c().avatar + 2
                return (
                  <view x={c().x} width={c().w} height={c().h}>
                    <view x={c().avatarX} width={d()} height={d()} borderRadius={d() / 2} color="#ffffff0f" />
                    <view
                      alpha={c().image ? 0 : 0.3}
                      x={c().avatarX + c().avatar / 2 - 20}
                      y={c().avatar / 2 - 20}
                      width={42}
                      height={42}
                      src="icons/d/group.webp"
                      color="#ffffffff"
                    />
                    <view
                      alpha={c().image ? 1 : 0}
                      x={c().avatarX + 1}
                      y={1}
                      width={c().avatar}
                      height={c().avatar}
                      borderRadius={c().avatar / 2}
                      src={c().image || undefined}
                      textureOptions={COVER}
                    />
                    <view
                      alpha={isFocus(c().idx) ? 0 : 1}
                      x={c().avatarX}
                      width={d()}
                      height={d()}
                      borderRadius={d() / 2}
                      color="#00000001"
                      border={{ width: 1, color: PERSON_EDGE }}
                    />
                    <view
                      alpha={isFocus(c().idx) ? 1 : 0}
                      x={c().avatarX}
                      width={d()}
                      height={d()}
                      borderRadius={d() / 2}
                      color="#00000001"
                      border={{ width: 1, color: ring() }}
                    />
                    <text
                      y={c().nameY + 1.5}
                      fontFamily={c().nameFont}
                      fontSize={16}
                      lineHeight={33}
                      maxWidth={c().w}
                      maxLines={1}
                      textAlign="center"
                      contain="width"
                      color="#ffffffff"
                    >
                      {c().name}
                    </text>
                    <text
                      y={c().roleY + 1.5}
                      fontFamily={c().roleFont}
                      fontSize={14}
                      lineHeight={33}
                      maxWidth={c().w}
                      maxLines={1}
                      textAlign="center"
                      contain="width"
                      color="#ffffff99"
                    >
                      {c().role}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
          <view width={trackW()} height={cardH()} pointerChildRing onPointerChildClick={(i) => pick(reviews, i)}>
            <For each={reviews.keys()}>
              {(k) => {
                const c = () => reviews.at(k)
                return (
                  <view x={c().x} width={520} height={250}>
                    <view width={520} height={250} borderRadius={16} color={isFocus(c().idx) ? '#34343cd1' : '#24242ab8'} />
                    <view
                      alpha={isFocus(c().idx) ? 1 : 0}
                      width={520}
                      height={250}
                      borderRadius={16}
                      color="#00000001"
                      border={{ width: 3, color: ring() }}
                    />
                    <view x={27} y={31} width={56} height={56} borderRadius={28} color="#ffffff29">
                      <text
                        y={13.5}
                        fontFamily={bold()}
                        fontSize={26}
                        lineHeight={34}
                        maxWidth={56}
                        textAlign="center"
                        contain="width"
                        color="#ffffffff"
                      >
                        {c().initial}
                      </text>
                      <view
                        alpha={c().avatar ? 1 : 0}
                        width={56}
                        height={56}
                        borderRadius={28}
                        src={c().avatar || undefined}
                        textureOptions={COVER}
                      />
                    </view>
                    <text
                      x={99}
                      y={c().meta ? 27 : 44.5}
                      fontFamily={c().authorFont}
                      fontSize={24}
                      lineHeight={33}
                      maxWidth={394}
                      maxLines={1}
                      color="#ffffffff"
                    >
                      {c().author}
                    </text>
                    <text x={99} y={61.5} fontFamily={regular()} fontSize={18} lineHeight={33} color="#ffffffa8">
                      {c().meta}
                    </text>
                    <text
                      x={27}
                      y={111}
                      fontFamily={c().previewFont}
                      fontSize={20}
                      lineHeight={28}
                      maxWidth={466}
                      maxLines={4}
                      color="#ffffffd1"
                    >
                      {c().preview}
                    </text>
                  </view>
                )
              }}
            </For>
          </view>
        </view>
      </view>
    </view>
  )
}
