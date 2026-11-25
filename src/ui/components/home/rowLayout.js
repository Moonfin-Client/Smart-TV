// Where Home's rows and their loading placeholders sit, in pixels. No imports beyond the pure layout
// helpers, so its check runs in node.
import { isCarouselRow, modernCardMetrics, MODERN_CAPTION_ROOM } from './modernCardLayout.js'
import { classicCardSize } from './rowPeek.js'

// Any line without a height of its own sits on a 33px line.
const LINE = 33

// Where a row's parts sit from its top, and how tall it is with the space under it. `extraH` is the
// focused card's extra height in a Modern row.
export const rowBox = (row, look, s, { first = false, firstMargin = 40, extraH = 0 } = {}) => {
  const top = first ? firstMargin : 0
  const sub = row.subtitle ? 1 : 0
  // Library Buttons: a 28px title 20px over a lane of 180px squares padded 20px, 30px under the row.
  if (row.isButtonRow) return { titleY: top, subtitleY: 0, scrollerY: top + LINE + 20, cardsY: top + LINE + 40, laneH: 220, panelY: 0, h: LINE + 20 + 220 + 30, top }
  if (look.style === 'classic' || row.forceClassic) {
    // A 28px title on a 33px line with 16px under it. The subtitle's 33px line pulls up 12 and
    // pushes down 12.
    const titleY = top
    const subtitleY = top + LINE + 16 - 12
    const scrollerY = top + LINE + 16 + (sub ? LINE - 12 + 12 : 0)
    const cardsY = scrollerY + 20
    const tallest = (row.cards || []).reduce((h, c) => Math.max(h, c.h), 0) || classicCardSize('portrait', s.homeRowsPosterSize).height
    // The art, then a home card's text, 16px over at least 86px, or off Home a 33px line padded
    // 10px, with a second one 4px under a series name.
    const second = (row.cards || []).some((c) => c.line2)
    const info = look.plain ? 10 + LINE + (second ? 4 + LINE : 0) + 10 : 16 + 86
    const laneH = 20 + tallest + info + 20
    return { titleY, subtitleY, scrollerY, cardsY, laneH, panelY: 0, h: scrollerY + laneH + (look.spacing || 0), top }
  }
  const carousel = look.style === 'carousel' && isCarouselRow(row, s) && !row.isGameRow && !row.isTileRow
  const titleY = top + 6
  const subtitleY = top + 6 + LINE + 1 + 2
  const scrollerY = top + 6 + LINE + 1 + (sub ? 2 + LINE : 0)
  const cardsY = scrollerY + 10
  const imageH = modernCardMetrics({ posterSize: s.homeRowsPosterSize }).imageHeight
  const tallest = (row.cards || []).reduce((h, c) => Math.max(h, c.h), 0) || imageH
  const content = carousel ? tallest : Math.max(imageH + MODERN_CAPTION_ROOM, tallest + extraH)
  const laneH = 10 + content + look.modernItemsBottom
  const panelY = scrollerY + laneH + 18
  const h = carousel ? panelY + 556 + 70 : scrollerY + laneH
  return { titleY, subtitleY, scrollerY, cardsY, laneH, panelY, h: h + (look.spacing || 0), top, carousel }
}

// A loading row's card size, as each row style's placeholder sizes its cards.
export const placeholderCard = (look, s, cardType) => {
  if (look.style === 'classic') {
    const size = classicCardSize(cardType === 'square' ? 'square' : 'portrait', s.homeRowsPosterSize)
    return { w: size.width, h: size.height }
  }
  const m = modernCardMetrics({ posterSize: s.homeRowsPosterSize, isSquareItem: cardType === 'square' })
  return { w: m.cardWidth, h: m.imageHeight }
}


// The four placeholder titles' widths, in pixels.
const TITLE_WIDTHS = [0, 1, 2, 3].map((i) => (140 + 24 * i) * 1.75)

// Every placeholder box, flattened so the template draws them from one list.
export const skeletonBoxes = ({ style, top, inset, cardW, cardH, spacing, carousel }) => {
  const boxes = []
  const panels = []
  let y = top + 40
  const modern = style !== 'classic'
  TITLE_WIDTHS.forEach((tw, r) => {
    const titleY = modern ? y + 6 + 2 : y + 2
    boxes.push({ k: `t${r}`, x: inset, y: titleY, w: tw, h: 28, r: 4 })
    const cardsY = modern ? y + 40 + 10 : y + 49 + 20
    for (let i = 0; i < 8; i++) {
      const x = inset + i * (cardW + 24)
      boxes.push({ k: `c${r}-${i}`, x, y: cardsY, w: cardW, h: cardH, r: modern ? 12 : 8 })
      if (modern) {
        boxes.push({ k: `a${r}-${i}`, x, y: cardsY + cardH + 10, w: cardW * 0.75, h: 24, r: 4 })
        boxes.push({ k: `b${r}-${i}`, x, y: cardsY + cardH + 41, w: cardW * 0.5, h: 20, r: 4 })
      } else {
        boxes.push({ k: `a${r}-${i}`, x, y: cardsY + cardH + 21, w: cardW * 0.75, h: 20, r: 4 })
      }
    }
    if (modern) {
      const laneBottom = y + 40 + 10 + cardH + 61 + 24
      if (carousel) {
        panels.push({ k: `p${r}`, y: laneBottom + 18 })
        y = laneBottom + 18 + 556 + 70
      } else {
        y = laneBottom
      }
    } else {
      y = cardsY + cardH + 74 + 20
    }
    y += spacing || 0
  })
  return { boxes: boxes.filter((b) => b.y < 1080), panels: panels.filter((p) => p.y < 1080) }
}


// The cards a lane draws, as [from, to) indices into `cards` (each { x, w }, in order along the
// lane): those reaching into the band from `left` to `right` in lane pixels, plus `margin` either
// side so a glide never uncovers an empty spot. A long row keeps a dozen cards alive, not forty.
export const laneWindow = (cards, left, right, margin) => {
  let from = 0
  while (from < cards.length && cards[from].x + cards[from].w < left - margin) from++
  let to = from
  while (to < cards.length && cards[to].x <= right + margin) to++
  return [from, to]
}

// The rows a band draws, as [from, to) indices into `placed` (each { y, box: { h } }): those showing
// in the band's stretch from `top` down `h`, one more either side for the glide, and always `keep`
// (the focused row).
export const bandWindow = (placed, top, h, keep) => {
  let from = 0
  while (from < placed.length && placed[from].y + placed[from].box.h <= top) from++
  let to = from
  while (to < placed.length && placed[to].y < top + h) to++
  from = Math.max(0, from - 1)
  to = Math.min(placed.length, to + 1)
  if (keep >= 0 && keep < placed.length) {
    from = Math.min(from, keep)
    to = Math.max(to, keep + 1)
  }
  return [from, to]
}
