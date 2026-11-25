// The Seerr block for Stage and Premiere: Seerr's name as a row title, then the Genres and Tags
// chip, the production facts three to a line and where it streams, 18px apart. Laid out as a
// display list from the same numbers Modern's Seerr tab uses.
import $L from '../../../services/i18n.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { buildMediaFacts } from '../../../utils/seerrMediaFacts.js'
import { cssShift, fontFor } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { emptyList } from './Draw.js'

const GAP = 18

export const seerrBlock = (sr, { title = true, w = 1142, sectionTitle = false } = {}) => {
  const out = emptyList()
  const pieces = (sr && sr.pieces) || {}
  if (!sr || !sr.details || !(pieces.chips || pieces.facts || pieces.streaming)) return null
  const d = sr.details
  const text = (k, x, y, t, size, weight, color, lh = 33) => out.texts.push({ k, x, y: y + cssShift(size), text: t, size, font: fontFor(t, weight), color, lh })
  let y = 0
  let chip = null
  if (title && sectionTitle) {
    // Inside one of Premiere's frames, the title takes the frame title's look.
    const label = String(sr.displayName || 'Seerr').toUpperCase()
    out.texts.push({ k: 'title', x: 0, y: cssShift(23.4), text: label, size: 23.4, font: fontFor(label, 'bold'), color: '#ffffffbf', lh: 33.46, ls: 3.3 })
    y = 33.46
  } else if (title) {
    text('title', 0, 0, sr.displayName || 'Seerr', 36.7, 'regular', '#ffffffff', 46.6)
    y = 46.6
  }
  const next = () => {
    if (y > 0) y += GAP
  }
  if (pieces.chips) {
    next()
    const label = $L('Genres and Tags')
    const w = 20 + textWidth(label, 14) + 20
    chip = { x: 0, y, w, h: 53 }
    out.rects.push({ k: 'chip', x: 0, y, w, h: 53, r: 26.5, color: '#374151ff' })
    text('chipText', 20, y + 10, label, 14, 'regular', '#ffffffff')
    y += 53
  }
  if (pieces.facts) {
    next()
    const facts = buildMediaFacts(d, sr.mediaType)
    const top = y
    let ly = y + 15
    const box = { k: 'facts', x: 0, y: top, w, h: 0, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f' }
    out.rects.push(box)
    for (let i = 0, li = 0; i < facts.length; i += 3, li++) {
      if (li) {
        ly += 10
        out.rects.push({ k: `rule${li}`, x: 21, y: ly, w: 1100, h: 1, color: '#ffffff1a' })
        ly += 11
      }
      facts.slice(i, i + 3).forEach((f, ci) => {
        const x = 21 + ci * 378
        if (ci) out.rects.push({ k: `sep${li}-${ci}`, x: x - 17, y: ly + 18, w: 1, h: 32, color: '#ffffff1a' })
        text(`fl${li}-${ci}`, x, ly, f.label, 14, 'medium', '#ffffff99')
        text(`fv${li}-${ci}`, x, ly + 36, f.value, 16, 'bold', '#ffffffff')
      })
      ly += 69
    }
    box.h = ly + 15 - top
    y = top + box.h
  }
  if (pieces.streaming) {
    next()
    const top = y
    const box = { k: 'streaming', x: 0, y: top, w, h: 0, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f' }
    out.rects.push(box)
    text('streamLabel', 21, y + 15, $L('Streaming on'), 14, 'medium', '#ffffff99')
    let px = 21
    let py = y + 15 + 33 + 10
    let rowH = 0
    ;(sr.streamingProviders || []).forEach((p, i) => {
      if (px + 92 > w - 21) {
        px = 21
        py += rowH + 10
        rowH = 0
      }
      out.imgs.push({ k: `sl${i}`, x: px + 14, y: py, w: 64, h: 64, src: seerrApi.getImageUrl(p.logoPath, 'w92'), r: 12 })
      const names = wrapLines(p.name || '', 14, 'bold', 92)
      names.forEach((n, j) => out.texts.push({ k: `sn${i}-${j}`, x: px + (92 - textWidth(n, 14, 'bold')) / 2, y: py + 70 + j * 16.8 + cssShift(14), text: n, size: 14, font: fontFor(n, 'bold'), color: '#ffffffff', lh: 16.8 }))
      rowH = Math.max(rowH, 70 + names.length * 16.8)
      px += 92 + 20
    })
    box.h = py + rowH + 10 + 15 - top
    y = top + box.h
  }
  return { list: out, h: y, chip }
}
