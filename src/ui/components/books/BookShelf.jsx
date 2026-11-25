import { For, createEffect, createMemo, createSelector, createSignal, on } from 'solid-js'
import { keyed } from '../library/pageKit.js'
import { focusScroll } from '../nav/focusScroll.js'
import BookCard from './BookCard.jsx'
import { shelfHeight } from './bookParts.js'

// Cards stand on the shelf's bottom edge, or hang from its top with `top`. `focus` is the focused
// index, or -1, and `pad` is the shelf's [top, right, bottom, left] padding. onPointerCard(i, { whole,
// click }) hears the Magic Remote's cursor on a card, whole when the shelf shows all of it
// (app/pointer.js). pointerRing rings the card under the cursor, for a page that scrolls to each shelf.
export default function BookShelf(props) {
  const [sx, setSx] = createSignal(0)
  const cards = () => props.cards || []
  const rowH = createMemo(() => cards().reduce((h, c) => Math.max(h, c.h + 78), 0))
  const placed = createMemo(() => {
    let x = props.pad[3]
    return cards().map((card, i) => {
      const out = { card, k: card.key, i, x, y: props.pad[0] + (props.top ? 0 : rowH() - (card.h + 78)) }
      x += card.w + props.gap
      return out
    })
  })
  const list = keyed(placed, (p) => p.k)
  const isFocused = createSelector(() => props.focus)
  const contentW = createMemo(() => {
    const l = cards()
    return l.reduce((w, c) => w + c.w, 0) + Math.max(0, l.length - 1) * props.gap + props.pad[1] + props.pad[3]
  })
  createEffect(
    on(
      () => props.focus,
      (i) => {
        const p = placed()[i]
        if (p) setSx(focusScroll(p.x, p.card.w, sx(), props.viewW, Math.max(0, contentW() - props.viewW)))
      },
    ),
  )
  const whole = (p) => p.x - sx() >= -0.5 && p.x + p.card.w - sx() <= props.viewW + 0.5
  const point = (p, click) => (props.onPointerCard ? props.onPointerCard(p.i, { whole: whole(p), click }) : false)
  return (
    <view x={props.x || 0} y={props.y || 0} width={props.viewW} height={shelfHeight(cards(), props.pad)} clipping>
      <view x={-sx()} width={Math.max(contentW(), props.viewW)} height={shelfHeight(cards(), props.pad)}>
        <For each={list.keys()}>
          {(k) => {
            const p = list.item(k)
            return (
              <BookCard
                x={p().x}
                y={p().y}
                card={p().card}
                look={props.look}
                zoom={props.zoom}
                focused={isFocused(p().i)}
                pointerRing={props.pointerRing}
                onPointerOver={() => point(p(), false)}
                onPointerClick={() => point(p(), true)}
              />
            )
          }}
        </For>
      </view>
    </view>
  )
}
