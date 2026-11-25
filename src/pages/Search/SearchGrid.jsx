import { For, createSignal } from 'solid-js'
import SearchCard from './SearchCard.jsx'
import GameCard from '../../ui/components/games/GameCard.jsx'
import { keyed } from '../../ui/components/library/pageKit.js'

// A tab's results wrapped into lines. It moves focus in four directions and lets the edges bubble
// to the page, and tells it onGridFocus(index) and onGridSelect(index). Lines far from focus aren't
// built.
const LINES_BEFORE = 2
const LINES_AFTER = 3

export default function SearchGrid(props) {
  const [cur, setCur] = createSignal(0)
  const [on, setOn] = createSignal(false)
  const g = () => props.grid
  const focusAt = () => (on() ? cur() : -1)
  const shown = () => {
    if (!g()) return []
    const cols = g().columns
    const line = Math.floor(cur() / cols)
    return g().cards.slice(Math.max(0, line - LINES_BEFORE) * cols, (line + LINES_AFTER + 1) * cols)
  }
  const cards = keyed(shown, (c) => c.key)
  const report = () => props.onGridFocus && props.onGridFocus(cur())
  const go = (next) => {
    setCur(next)
    report()
    return true
  }
  return (
    <view
      ref={props.ref}
      onFocusChanged={(has) => {
        setOn(has)
        if (has) report()
      }}
      onLeft={() => (cur() % g().columns === 0 ? false : go(cur() - 1))}
      onRight={() => {
        if ((cur() + 1) % g().columns !== 0 && cur() + 1 < g().cards.length) go(cur() + 1)
        return true
      }}
      onUp={() => (cur() < g().columns ? false : go(cur() - g().columns))}
      onDown={() => {
        const count = g().cards.length
        const next = cur() + g().columns
        // From a full line onto a shorter last one, focus lands on its last card.
        if (next < count) go(next)
        else if (Math.floor(cur() / g().columns) < Math.floor((count - 1) / g().columns)) go(count - 1)
        return true
      }}
      onEnter={() => {
        if (props.onGridSelect) props.onGridSelect(cur())
        return true
      }}
    >
      <For each={cards.keys()}>
        {(k) => {
          const c = cards.item(k)
          return c().kind === 'game' ? (
            <GameCard x={c().x} y={c().y} card={c()} focused={c().idx === focusAt()} />
          ) : (
            <SearchCard x={c().x} y={c().y} card={c()} focused={c().idx === focusAt()} />
          )
        }}
      </For>
    </view>
  )
}
