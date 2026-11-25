import { For, createSignal } from 'solid-js'
import SearchCard from './SearchCard.jsx'
import GameCard from '../../ui/components/games/GameCard.jsx'
import { keyed } from '../../ui/components/library/pageKit.js'
import { initialCardCount, expandedCardCount } from '../../utils/rowWindow.js'

// One row of Search's All tab, with a scroller that keeps the focused card 50px inside either edge.
// It owns Left, Right and Enter, and tells the page onRowFocus(rowIndex, cardIndex) and
// onRowSelect(rowIndex, cardIndex). Only rows next to the focused one get cards (mounted). The page
// keeps how many cards each row has built (grownCount) and hears onRowGrow(rowKey, count).
const EDGE = 50
// Cards this far behind focus are off screen, so they aren't built.
const BEHIND = 4

export default function SearchRow(props) {
  const [cur, setCur] = createSignal(0)
  const [on, setOn] = createSignal(false)
  const [scrollX, setScrollX] = createSignal(0)
  const row = () => props.row
  const focusAt = () => (on() ? cur() : -1)
  const clipW = () => 1920 - props.left
  const shown = () => {
    if (!props.mounted || !row()) return []
    // A row builds its first cards, and more as focus nears the last of them.
    const visible = props.grownCount || initialCardCount(row().cards.length)
    return row().cards.slice(Math.max(0, cur() - BEHIND), Math.max(visible, cur() + 1))
  }
  const cards = keyed(shown, (c) => c.key)
  const report = () => props.onRowFocus && props.onRowFocus(props.rowIndex, cur())
  // The scroller moves by the least that brings the card inside its edges.
  const reveal = () => {
    const card = row().cards[cur()]
    if (!card) return
    const left = 68 + card.x - scrollX()
    const right = left + card.w
    const max = Math.max(0, row().contentW + 128 - clipW())
    let next = scrollX()
    if (left < EDGE) next -= EDGE - left
    else if (right > clipW() - EDGE) next += right - (clipW() - EDGE)
    setScrollX(Math.max(0, Math.min(max, next)))
  }
  const move = (delta) => {
    const next = cur() + delta
    if (!row() || next < 0 || next >= row().cards.length) return false
    setCur(next)
    const count = row().cards.length
    const visible = props.grownCount || initialCardCount(count)
    const grown = expandedCardCount(visible, next, count)
    if (grown !== visible && props.onRowGrow) props.onRowGrow(row().key, grown)
    reveal()
    report()
    return true
  }
  return (
    <view
      ref={props.ref}
      y={props.y || 0}
      width={1920}
      height={row().h}
      onFocusChanged={(has) => {
        setOn(has)
        if (has) report()
      }}
      onLeft={() => move(-1)}
      onRight={() => move(1) || true}
      onEnter={() => {
        if (props.onRowSelect) props.onRowSelect(props.rowIndex, cur())
        return true
      }}
    >
      <text fontFamily={row().titleFont} fontSize={22} lineHeight={33} x={props.left + 60} y={2} color="#ffffff">
        {row().title}
      </text>
      <text fontFamily={row().countFont} fontSize={16} lineHeight={33} x={row().countX} y={2} color="#ffffff80">
        {row().count}
      </text>
      <view x={props.left} y={47} width={clipW()} height={row().h - 47} clipping>
        <view
          x={68 - scrollX()}
          y={30}
          width={row().contentW + 136}
          height={row().h}
          transition={{ x: { duration: 250, easing: 'ease-in-out' } }}
        >
          <For each={cards.keys()}>
            {(k) => {
              const c = cards.item(k)
              return c().kind === 'game' ? (
                <GameCard x={c().x} y={12} card={c()} focused={c().idx === focusAt()} />
              ) : (
                <SearchCard x={c().x} card={c()} focused={c().idx === focusAt()} />
              )
            }}
          </For>
        </view>
      </view>
    </view>
  )
}
