import { For, Show, createMemo, createSelector, createSignal, onCleanup } from 'solid-js'
import GameCard from '../games/GameCard.jsx'
import { showsGameDescription } from './tileCards.js'
import { laneWindow } from './rowLayout.js'
import * as settings from '../../../state/settings.js'
import { theme } from '../../theme.js'
import { hex } from '../../color.js'
import { cssShift, fontFor, uiFont } from '../../text.js'

// One of Home's tile rows: Seerr's genre, shortcut, studio and network tiles, or a game library's
// recent games as box art cards with the focused game's description under them in a Modern look.
// The lane glides the focused card to its leading edge. Left from the first card goes to the
// sidebar, or wraps to the last with the top bar, and Right from the last wraps to the first. The
// page hears onRowFocus once focus has rested 50ms. Props as MediaRow's.

const FOCUS_ITEM_MS = 50
const MARGIN = 450
const COVER = { resizeMode: { type: 'cover' } }
const CONTAIN = { resizeMode: { type: 'contain' } }
const RING = { width: 3, color: hex('#ffffffff') }
const titleFont = () => uiFont('bold')

function TileCard(props) {
  const c = () => props.card
  return (
    <view x={c().x} width={c().w} height={c().h} pivot={0.5} scale={props.focused ? 1.05 : 1} transition={{ scale: { duration: 150, easing: 'ease' } }}>
      <view width={c().w} height={c().h} borderRadius={8} color={props.look.surface} />
      <Show when={c().image && c().kind === 'tile'}>
        <view x={3} y={3} width={c().w - 6} height={c().h - 6} borderRadius={5} src={c().image} textureOptions={COVER} />
      </Show>
      <Show when={c().image && c().kind === 'logo'}>
        <view x={27} y={27} width={c().w - 54} height={c().h - 54} src={c().image} textureOptions={CONTAIN} />
      </Show>
      <Show when={c().kind === 'tile'}>
        <view x={3} y={c().h - 68} width={c().w - 6} height={65} borderRadius={[0, 0, 5, 5]} colorTop="#00000000" colorBottom="#000000d9" />
        <text x={19} y={c().labelY} fontFamily={c().nameFont} fontSize={24} lineHeight={33} maxWidth={c().w - 38} maxLines={1} color="#ffffffff">
          {c().name}
        </text>
      </Show>
      <view width={c().w} height={c().h} borderRadius={8} color="#00000000" border={RING} alpha={props.focused ? 1 : 0} />
    </view>
  )
}

export default function TileRow(props) {
  const [cur, setCur] = createSignal(Math.max(0, props.startIndex || 0))
  const [focused, setFocused] = createSignal(false)
  const isCur = createSelector(cur)
  const L = () => props.look
  const cards = () => props.row.cards || []
  let noteTimer = null
  onCleanup(() => clearTimeout(noteTimer))
  const laneW = () => {
    const last = cards()[cards().length - 1]
    return last ? last.x + last.w + (props.row.isGameRow ? 12 : 0) : 0
  }
  const scroll = createMemo(() => {
    const c = cards()[cur()]
    const first = cards()[0]
    if (!c || !first) return 0
    const max = Math.max(0, L().pad * 2 + laneW() - L().viewW)
    return Math.min(c.x - first.x, max)
  })
  const shown = createMemo(() => {
    const [from, to] = laneWindow(cards(), scroll() - L().pad, scroll() - L().pad + L().viewW, MARGIN)
    return cards().slice(from, to)
  })
  const description = createMemo(() => showsGameDescription(props.row, settings.all()))
  // The focused game's overview, gone once focus leaves the row. A paragraph's line breaks collapse
  // into spaces.
  const descText = () => {
    const c = cards()[cur()]
    return focused() && c && c.raw && typeof c.raw.Overview === 'string' ? c.raw.Overview.replace(/\s+/g, ' ').trim() : ''
  }
  const settle = () => {
    const c = cards()[cur()]
    clearTimeout(noteTimer)
    if (!c) return
    const at = cur()
    noteTimer = setTimeout(() => props.onRowFocus && props.onRowFocus(c, props.row.key, at), FOCUS_ITEM_MS)
  }
  const move = (to) => {
    if (to === cur() || to < 0 || to >= cards().length) return
    setCur(to)
    if (props.onRowCur) props.onRowCur(props.row.key, to)
    settle()
  }
  return (
    <view
      ref={(n) => {
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
      <text
        x={L().inset}
        y={props.box.titleY + cssShift(28)}
        fontFamily={titleFont()}
        fontSize={28}
        lineHeight={33}
        maxWidth={L().viewW - L().pad * 2}
        maxLines={1}
        color={L().onSurface}
      >
        {props.row.title || ''}
      </text>
      <view x={L().clipX} y={props.box.scrollerY} width={L().viewW} height={props.box.laneH} clipping>
        <view y={20} x={L().pad - scroll()} width={L().pad * 2 + laneW() + 1920} height={props.box.laneH} transition={{ x: { duration: 220, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' } }}>
          <Show
            when={props.row.isGameRow}
            fallback={<For each={shown()}>{(c) => <TileCard card={c} look={L()} focused={isCur(c.idx) && focused()} />}</For>}
          >
            <For each={shown()}>{(c) => <GameCard x={c.x} y={c.y} card={c.game} ring={L().accent} focused={isCur(c.idx) && focused()} />}</For>
          </Show>
        </view>
      </view>
      <Show when={description()}>
        <text
          x={L().inset}
          y={props.box.descY + cssShift(24)}
          fontFamily={fontFor(descText())}
          fontSize={24}
          lineHeight={36}
          maxWidth={1200}
          maxLines={3}
          color={theme().textSecondary}
        >
          {descText()}
        </text>
      </Show>
    </view>
  )
}
