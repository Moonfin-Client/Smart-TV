import { rowFont } from '../rowFont.js'

// Fonts and art for a card model from build.cardRow, worked out once when it's built.
const ach = (name) => 'icons/ach/' + name + '.webp'

export const dressCard = (card) => {
  card.lead.forEach((ld) => {
    if (ld.kind === 'tile') ld.src = ach(ld.icon)
    else if (ld.kind === 'glyph') ld.src = 'icons/settings/' + ld.icon + '.webp'
    else if (ld.kind === 'avatar') ld.font = rowFont(ld.letter || '', 'bold')
    else if (ld.kind === 'gutter') ld.font = rowFont(ld.text || '', 'bold')
  })
  card.lines.forEach((line) => {
    if (line.kind !== 'bar') line.font = rowFont(line.text || '', line.kind === 'heading' ? 'bold' : 'regular')
  })
  card.trail.forEach((t) => {
    if (t.kind === 'stack') {
      t.topFont = rowFont(t.top || '', 'bold')
      t.bottomFont = rowFont(t.bottom || '')
    } else if (t.kind === 'text') t.font = rowFont(t.text || '', 'bold')
    else if (t.kind === 'unread') t.font = rowFont(String(t.count), 'bold')
  })
  return card
}
