// Where the Playback Information, Chapters and Cast & Crew modals put things at 1080p. Their
// borders draw 1px wide.
import { lineCount, textWidth } from './look.js'

// Playback Information: a 935 wide panel, 1px border, 33 padding and a 33px title in 38.61.

const INFO_LIST_MAX = 1000 - 2 * 2 - 2 * 33 - 33 * 1.17 - 20 - 2 - 13
export const INFO = {
  INNER_W: 933,
  LIST_TOP: 1 + 33 + 33 * 1.17 + 20 + 1 + 13,
  LIST_MAX: INFO_LIST_MAX,
  // The panel's height less its list.
  CHROME: 1 + 33 + 33 * 1.17 + 20 + 1 + 13 + 33 + 1,
  PAD_X: 27,
  STEP: 200,
  THUMB_MIN: 40,
}
// CSS lays the 25.74 line out at 25.7.
const ROW_LH = 25.7
const VALUE_GAP = 20

// The sections as text runs from the top of the list: headings, notes and labels on the left,
// values on the right, wrapping at the space the label leaves.
export const infoLayout = (sections) => {
  const left = []
  const right = []
  const textW = INFO.INNER_W - 2 * INFO.PAD_X
  let y = 0
  ;(sections || []).forEach((section) => {
    left.push({ key: `h-${section.id}`, kind: 'header', text: section.title, y: y + 20, size: 27 })
    y += 20 + 27 * 1.17 + 7
    section.rows.forEach((row, i) => {
      if (row.note) {
        const lines = Math.max(1, lineCount(row.note, 20, 'regular', textW))
        left.push({ key: `n-${section.id}-${i}`, kind: 'note', text: row.note, y, size: 20, lines })
        y += lines * 20 * 1.17 + 7
        return
      }
      const value = String(row.value)
      const valueW = Math.max(0, textW - textWidth(row.label, 22) - VALUE_GAP)
      const weight = row.bold ? 'bold' : 'regular'
      const lines = value.split('\n').reduce((n, part) => n + Math.max(1, lineCount(part, 22, weight, valueW)), 0)
      left.push({ key: `l-${section.id}-${i}`, kind: 'label', text: row.label, y: y + 5, size: 22 })
      right.push({ key: `v-${section.id}-${i}`, text: value, bold: !!row.bold, y: y + 5, x: INFO.INNER_W - INFO.PAD_X - valueW, w: valueW })
      y += 10 + lines * ROW_LH
    })
  })
  return { left, right, h: y + 27 }
}

// The scrollbar thumb is as tall as the share of the list on screen, never under 40.
export const infoThumb = (scroll, viewH, contentH) => {
  if (contentH <= viewH) return { h: 0, y: 0 }
  const h = Math.max(INFO.THUMB_MIN, (viewH * viewH) / contentH)
  return { h, y: (scroll / (contentH - viewH)) * (viewH - h) }
}

// The track dialog box the Chapters and Cast & Crew lists sit in: the title's line box and the list
// top, from the top of the box inside its border.
export const BOX = { PAD: 30, LIST_Y: 30 + 33 + 18 + 1 + 18, FOOT_GAP: 20, FOOT_H: 33 + 18 }

export const CHAPTER = { BOX_W: 1500, PAD_X: 36, TOP: 12, BOTTOM: 16, W: 280, H: 228, GAP: 16 }

// A chapter is current from its start until the next one starts.
export const chapterCards = (chapters, at, image) =>
  chapters.map((c, i) => {
    const start = c.startPositionTicks / 10000000
    const next = chapters[i + 1]
    return {
      i,
      key: String(c.index),
      x: CHAPTER.PAD_X + i * (CHAPTER.W + CHAPTER.GAP),
      name: c.name || '',
      start,
      ticks: c.startPositionTicks,
      current: at >= start && (!next || at < next.startPositionTicks / 10000000),
      image: image(c),
    }
  })

export const CAST = { PAD_X: 4, TOP: 8, BOTTOM: 12, W: 160, GAP: 16, PHOTO: 146, NAME_LH: 17 * 1.2, ROLE_LH: 15 * 1.2 }

// The name wraps to two lines at most, and every card stretches to the tallest.
export const castCards = (people, { image, unknown, cast }) => {
  const cards = people.map((p, i) => {
    const name = p.Name || unknown
    const lines = Math.min(2, Math.max(1, lineCount(name, 17, 'bold', CAST.W)))
    return {
      i,
      key: `${p.Id || p.Name || 'person'}-${i}`,
      x: CAST.PAD_X + i * (CAST.W + CAST.GAP),
      name,
      nameH: lines * CAST.NAME_LH,
      role: p.Role || p.Type || cast,
      image: image(p),
      letter: (p.Name || '?').charAt(0).toUpperCase(),
      person: p,
    }
  })
  const h = cards.reduce((m, c) => Math.max(m, CAST.PHOTO + 8 + c.nameH + 2 + CAST.ROLE_LH), 0)
  return { cards, h }
}

// A row of cards as wide as its padding and cards.
export const rowWidth = (n, pad, w, gap) => (n ? 2 * pad + n * w + (n - 1) * gap : 0)

// Where a card row scrolls when a card takes focus. A card wholly out of view is centered, and a
// partly shown one comes in by the least that shows it, and 24 more.
export const rowScroll = (scroll, left, w, viewW, contentW) => {
  const max = Math.max(0, contentW - viewW)
  const clamp = (v) => Math.max(0, Math.min(max, v))
  if (left + w <= scroll || left >= scroll + viewW) return clamp(left + w / 2 - viewW / 2)
  if (left < scroll) return clamp(left - 24)
  if (left + w > scroll + viewW) return clamp(left + w - viewW + 24)
  return scroll
}
