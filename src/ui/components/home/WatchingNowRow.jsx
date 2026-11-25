import $L from '../../../services/i18n.js'
import { For, Show, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import ClassicCard from './ClassicCard.jsx'
import { classicCard, placeCards, withRaw } from './cards.js'
import { laneWindow } from './rowLayout.js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { cssShift, fontFor, textWidth, uiFont } from '../../text.js'
import { pointerFocus } from '../../../app/pointer.js'

// MDBList's Watching Now row on Home: a globe beside the title, a live dot beside the summary, and
// landscape cards on their backdrops without captions, each with its rank, its type, its logo (or
// title) and how many are watching. The row and its cards are the classic row's in every style. It
// owns Left, Right and Enter like the others. Props as MediaRow's.

const LINE = 33
const FOCUS_ITEM_MS = 50
const MARGIN = 450

export const shapeWatchingRow = (row, look, s) => {
  const cards = (row.items || []).map((it, i) => {
    const c = classicCard(it, i, { s, cardType: 'landscape', imageType: 'backdrop', posterLabels: false })
    const name = it.Name || ''
    const type = (it.Type === 'Series' ? $L('Series') : $L('Movie')).toUpperCase()
    const watchers = $L('{count} watching').replace('{count}', String(it.Watchers || 0))
    return withRaw(
      {
        ...c,
        line1: '',
        line2: '',
        rank: String(it.Rank || i + 1),
        type,
        typeW: textWidth(type, 17, 'bold') + type.length + 20,
        logo: it._externalLogoUrl || '',
        logoName: name,
        logoFont: fontFor(name, 'bold'),
        watchers,
        watchersFont: uiFont('medium'),
      },
      it,
    )
  })
  return { ...row, cards: placeCards(cards), seeAll: null }
}

// The header line, 4px, the summary line, 20px, then the classic lane padded 20px around cards
// that carry no captions.
export const watchingRowBox = (row, look, top = 0) => {
  const titleY = top
  const subtitleY = top + LINE + 4
  const scrollerY = subtitleY + (row.subtitle ? LINE + 20 : 16)
  const cardsY = scrollerY + 20
  const tallest = (row.cards || []).reduce((h, c) => Math.max(h, c.h), 0)
  const laneH = 20 + tallest + 20
  return { titleY, subtitleY, scrollerY, cardsY, laneH, panelY: 0, h: scrollerY + laneH + (look.spacing || 0), top }
}

const LIVE_GLOW = { color: shadowColor('#22c55e87'), x: 0, y: 0, blur: 7, spread: 2 }
const SUMMARY_GLOW = { color: shadowColor('#22c55eab'), x: 0, y: 0, blur: 8, spread: 3 }
const CHIP_EDGE = { width: 1, color: hex('#ffffff3d') }
const LOGO_FIT = { resizeMode: { type: 'contain', x: 0.5, y: 1 } }

function Overlay(props) {
  const c = () => props.card
  return (
    <view
      x={c().x}
      width={c().w}
      height={c().h}
      pivot={0.5}
      scale={props.focused && props.look.zoom ? 1.05 : 1}
      transition={{ scale: { duration: 150, easing: 'ease-out' } }}
    >
      <view width={c().w} height={c().h} borderRadius={props.look.classicRadius} colorTop="#00000040" colorBottom="#000000d9" />
      <text x={20} y={17} fontFamily="roboto-bold" fontSize={30} lineHeight={30} color="#ffffffff">
        {c().rank}
      </text>
      <view x={c().w - 20 - c().typeW} y={17} width={c().typeW} height={26.4} borderRadius={7} color="#000000a6" border={CHIP_EDGE}>
        <text x={10} y={3} fontFamily="roboto-bold" fontSize={17} lineHeight={20.4} letterSpacing={1} color="#ffffffff">
          {c().type}
        </text>
      </view>
      <Show
        when={c().logo}
        fallback={
          <text
            x={23}
            y={c().h - 43}
            mountY={1}
            fontFamily={c().logoFont}
            fontSize={23}
            lineHeight={27.6}
            maxWidth={c().w - 46}
            maxLines={2}
            contain="width"
            textAlign="center"
            color="#ffffffff"
          >
            {c().logoName}
          </text>
        }
      >
        <view x={23} y={c().h - 43 - 73} width={c().w - 46} height={73} src={c().logo} textureOptions={LOGO_FIT} />
      </Show>
      <view x={20} y={c().h - 13 - 21.6 + 4.8} width={12} height={12} borderRadius={6} color="#22c55eff" shadow={LIVE_GLOW} />
      <text x={42} y={c().h - 13 - 21.6} fontFamily={c().watchersFont} fontSize={18} lineHeight={21.6} color="#ffffffff">
        {c().watchers}
      </text>
    </view>
  )
}

export default function WatchingNowRow(props) {
  const [cur, setCur] = createSignal(Math.max(0, props.startIndex || 0))
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(cur)
  const L = () => props.look
  const cards = () => props.row.cards || []
  let noteTimer = null
  onCleanup(() => clearTimeout(noteTimer))
  const scroll = createMemo(() => {
    const c = cards()[cur()]
    const last = cards()[cards().length - 1]
    if (!c || !last) return 0
    const max = Math.max(0, L().pad * 2 + last.x + last.w - L().viewW)
    return Math.min(c.x, max)
  })
  const shown = createMemo(() => {
    const [from, to] = laneWindow(cards(), scroll() - L().pad, scroll() - L().pad + L().viewW, MARGIN)
    return cards().slice(from, to)
  })
  const settle = () => {
    const c = cards()[cur()]
    clearTimeout(noteTimer)
    if (!c) return
    const at = cur()
    noteTimer = setTimeout(() => props.onRowFocus && props.onRowFocus(c, props.row.key, at), FOCUS_ITEM_MS)
  }
  // The Magic Remote's cursor rings a card, and a click focuses it and opens it (app/pointer.js). The
  // row slides to its focused card, so hover doesn't move focus.
  let self
  const pick = (c) => {
    if (!c) return false
    pointerFocus(self)
    if (props.onPointerRow) props.onPointerRow()
    if (c.idx !== cur()) move(c.idx)
    return true
  }
  const move = (to) => {
    if (to === cur() || to < 0 || to >= cards().length) return
    setCur(to)
    if (props.onRowCur) props.onRowCur(props.row.key, to)
    settle()
  }
  const titleFont = () => uiFont('bold')
  // The lane spans every card, since an unsized view scrolled past its parent counts as off screen.
  const spanW = () => {
    const last = cards()[cards().length - 1]
    return L().pad * 2 + (last ? last.x + last.w : 0) + 1920
  }
  return (
    <view
      ref={(n) => {
        self = n
        n.focusIndex = (i) => setCur(Math.max(0, Math.min(i, cards().length - 1)))
        n.cur = cur
        if (props.ref) props.ref(n)
      }}
      y={props.y || 0}
      width={1920}
      height={props.box.h}
      onFocusChanged={(has) => {
        setFocused(has)
        if (has) settle()
      }}
      onLeft={() => {
        if (cur() > 0) move(cur() - 1)
        else if (props.leftNav) return false
        else move(cards().length - 1)
        return true
      }}
      onRight={() => {
        move(cur() < cards().length - 1 ? cur() + 1 : 0)
        return true
      }}
      onEnter={() => {
        const c = cards()[cur()]
        if (c && props.onRowSelect) props.onRowSelect(c, props.row.key, cur())
        return true
      }}
    >
      <view x={L().inset} y={props.box.titleY + 1.5} width={30} height={30} src="icons/home_public.webp" color={L().onSurface} />
      <text
        x={L().inset + 40}
        y={props.box.titleY + cssShift(28)}
        fontFamily={titleFont()}
        fontSize={28}
        lineHeight={33}
        maxWidth={L().viewW - L().pad * 2 - 40}
        maxLines={1}
        color={L().onSurface}
      >
        {props.row.title || ''}
      </text>
      <Show when={props.row.subtitle}>
        <view x={L().inset} y={props.box.subtitleY + 10} width={13} height={13} borderRadius={6.5} color="#22c55eff" shadow={SUMMARY_GLOW} />
        <text x={L().inset + 23} y={props.box.subtitleY + cssShift(22)} fontFamily={titleFont()} fontSize={22} lineHeight={33} color="#fffffff2">
          {props.row.subtitle}
        </text>
      </Show>
      <view x={L().clipX} y={props.box.scrollerY} width={L().viewW} height={props.box.laneH} clipping>
        <view y={20} x={L().pad - scroll()} width={spanW()} height={props.box.laneH} transition={{ x: { duration: 220, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' } }}>
          <view width={spanW()} height={props.box.laneH} pointerChildRing onPointerChildClick={(i) => pick(shown()[i])}>
            <For each={shown()}>{(c) => <ClassicCard card={c} x={c.x} look={L()} focused={isCur(c.idx) && focused()} />}</For>
          </view>
          <view width={spanW()} height={props.box.laneH} onPointerChildClick={(i) => pick(shown()[i])}>
            <For each={shown()}>{(c) => <Overlay card={c} look={L()} focused={isCur(c.idx) && focused()} />}</For>
          </view>
        </view>
      </view>
    </view>
  )
}
