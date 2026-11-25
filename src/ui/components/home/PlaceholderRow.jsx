import { For, Show, createMemo } from 'solid-js'
import { placeholderCard } from './rowLayout.js'
import * as settings from '../../../state/settings.js'
import { shadowColor } from '../../theme.js'
import { hex } from '../../color.js'
import { cssShift, fontFor } from '../../text.js'

// A Home section still loading: its title over eight placeholder cards in its row style, and in a
// Carousel row the empty panel under them. Only the cards breathe, on the `dim` the rows share.
// Props: `row`, `box`, `look`, `dim`, `y`, `ref`.

const COUNT = 8
const PANEL_SHADOW = { color: shadowColor('#00000073'), x: 0, y: 24, blur: 60, spread: 0 }
const PANEL_EDGE = { width: 1, color: hex('#ffffff1f') }

const placeholderBoxes = (look, type, s) => {
  const card = placeholderCard(look, s, type === 'square' ? 'square' : 'portrait')
  const modern = look.style !== 'classic'
  const out = []
  for (let i = 0; i < COUNT; i++) {
    const x = look.pad + i * (card.w + 24)
    out.push({ k: `c${i}`, x, y: 0, w: card.w, h: card.h, r: modern ? 12 : 8 })
    if (modern) {
      out.push({ k: `a${i}`, x, y: card.h + 10, w: card.w * 0.75, h: 24, r: 4 })
      out.push({ k: `b${i}`, x, y: card.h + 41, w: card.w * 0.5, h: 20, r: 4 })
    } else {
      out.push({ k: `a${i}`, x, y: card.h + 21, w: card.w * 0.75, h: 20, r: 4 })
    }
  }
  return out
}

export default function PlaceholderRow(props) {
  const L = () => props.look
  const boxes = createMemo(() => placeholderBoxes(L(), props.row.type, settings.all()))
  const titleSize = () => (L().style === 'classic' ? 28 : L().modernTitleSize)
  const panelW = () => L().viewW - L().pad * 2
  return (
    <view ref={props.ref} y={props.y || 0} width={1920} height={props.box.h}>
      <text
        x={L().inset}
        y={props.box.titleY + cssShift(titleSize())}
        fontFamily={fontFor(props.row.title || '', 'bold')}
        fontSize={titleSize()}
        lineHeight={33}
        maxWidth={panelW()}
        maxLines={1}
        color={L().onSurface}
      >
        {props.row.title || ''}
      </text>
      <view x={L().clipX} y={props.box.scrollerY} width={L().viewW} height={props.box.laneH} clipping>
        <view
          y={props.box.cardsY - props.box.scrollerY}
          alpha={props.dim ? 0.45 : 1}
          transition={{ alpha: { duration: 1300, easing: 'ease-in-out' } }}
        >
          <For each={boxes()}>{(b) => <view x={b.x} y={b.y} width={b.w} height={b.h} borderRadius={b.r} color={L().skeleton} />}</For>
        </view>
      </view>
      <Show when={props.box.carousel}>
        <Show when={L().panelShadow}>
          <view x={L().inset} y={props.box.panelY} width={panelW()} height={556} borderRadius={28} color="#10121800" shadow={PANEL_SHADOW} />
        </Show>
        <view x={L().inset} y={props.box.panelY} width={panelW()} height={556} borderRadius={28} color="#ffffff0f" border={PANEL_EDGE} />
      </Show>
    </view>
  )
}
