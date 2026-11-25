// Nouveau's page laid out at 1920x1080 as plain lists the page draws. One column: the hero, then a
// band per section, each 64px apart and the details footer 80px down, with 80px under the last.
import $L from '../../../services/i18n.js'
import { cssShift, fontFor } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { ratingsRow } from '../modern/hero.js'
import { SEERR_PILL } from '../modern/meta.js'
import { OVERVIEW_W, overviewHeight, shrinkRow } from './geometry.js'

export const HERO_W = 680
const NO_BORDER = '#00000000'

const out = () => ({ rects: [], imgs: [], texts: [] })

// Every entry carries every field Draw binds, so nothing reads one that isn't there.
export const text = (o, k, x, y, str, size, weight, color, extra) => {
  o.texts.push({
    k, x: Math.round(x * 100) / 100, y: y + cssShift(size), text: str, size, font: fontFor(str, weight), color, lh: size,
    maxw: 1900, maxlines: 1, ls: 0.01, ellipsis: false, ...extra,
  })
}

export const finish = (o) => ({
  rects: o.rects.map((r) => ({ r: 0, bw: 0, bc: NO_BORDER, ...r })),
  imgs: o.imgs.map((im) => ({ r: 0, fit: 'cover', color: '#ffffffff', ...im })),
  texts: o.texts.map((t) => ({ maxw: 1900, maxlines: 1, ls: 0.01, ellipsis: false, ...t, lh: t.lh || t.size, maxw: t.maxw || 1900, maxlines: t.maxlines || 1, ls: t.ls || 0.01 })),
})

// Words that wrap at a width with a letter spacing, which measure.wrapLines leaves out.
const wrapSpaced = (str, size, weight, spacing, maxW) => {
  const lines = []
  let line = ''
  String(str || '').split(/\s+/).filter(Boolean).forEach((word) => {
    const next = line ? `${line} ${word}` : word
    if (!line || textWidth(next, size, weight, spacing) <= maxW) line = next
    else {
      lines.push(line)
      line = word
    }
  })
  if (line) lines.push(line)
  return lines
}

// The overview box: three lines of plain copy, or a focusable box with Read More under it. Its 2px
// focus border takes a pixel of padding off each side, so the page under it moves up 2px while it
// holds focus.
export const overviewBox = (prose) => {
  const plain = wrapLines(prose, 18, 'regular', OVERVIEW_W).length
  const canToggle = plain > 3
  const textW = canToggle ? OVERVIEW_W - 36 : OVERVIEW_W
  const lines = canToggle ? wrapLines(prose, 18, 'regular', textW).length : plain
  return { canToggle, textW, lines }
}

// The hero column. `d` is what the page worked out about the item, and the result is the draw
// lists, where the overview and the action row go, and where the hero ends.
export const layoutHero = (d, t) => {
  const o = out()
  const x0 = d.left
  let y = d.top
  if (d.genreLine) {
    text(o, 'genres', x0, y, d.genreLine, 14.5, 'bold', '#ffffffa3', { lh: 14.5, ls: 1.7, maxw: HERO_W, ellipsis: true })
    y += 14.5 + 17
  } else if (d.reserveGenres) y += 31.5

  // The branding: the title, the logo, or a season's series logo with its own name beside it.
  if (!d.logo) {
    const lines = wrapSpaced(d.name, 41, 'bold', -0.9, HERO_W)
    lines.slice(0, 2).forEach((ln, i) => {
      const last = i === 1 && lines.length > 2
      text(o, `title${i}`, x0, y + i * 41.82, ln, 41, 'bold', '#ffffffff', { lh: 41.82, ls: -0.9, maxw: last ? HERO_W : 0, ellipsis: last })
    })
    y += Math.min(2, lines.length) * 41.82
  } else {
    const L = d.logo
    if (d.isSeason) {
      const k = L.w ? Math.min(1, 201 / L.w, 80 / L.h) : 0
      const w = L.w * k
      const h = L.h * k
      if (w) o.imgs.push({ k: 'logo', x: x0, y: y + (106 - h) / 2, w, h, src: L.url, fit: 'contain' })
      const tx = x0 + (w ? w + 18 : 0)
      text(o, 'companion', tx, y + (106 - 31.5) / 2, d.name, 30, 'bold', '#ffffffff', { lh: 31.5, ls: -0.6, maxw: 480 - (tx - x0), ellipsis: true })
    } else if (L.w) {
      const k = Math.min(1, 480 / L.w, 106 / L.h)
      const w = L.w * k
      const h = L.h * k
      o.imgs.push({ k: 'logo', x: x0, y: y + (106 - h) / 2, w, h, src: L.url, fit: 'contain' })
    }
    y += 106
  }

  // The series status, the next episode's date (in the focus color) and Seerr's pills, 9px apart
  // and Seerr's 12px apart in a group of their own. A row wider than the column squeezes the status
  // badges, whose words wrap, as flex-shrink does, while Seerr's pills keep their width.
  const badges = []
  const status = (text, fill) => {
    const longest = Math.max(...String(text).split(/\s+/).map((w) => textWidth(w, 13, 'bold')))
    badges.push({ kind: 'status', text, fill, base: 22 + textWidth(text, 13, 'bold'), min: 22 + longest })
  }
  if (d.status) status(d.status === 'Ended' ? $L('Ended') : $L('Continuing'), d.status === 'Ended' ? '#b71c1cff' : '#2e7d32ff')
  if (d.upcoming) status(d.upcoming, t.focus)
  const pills = (d.seerrPills || []).map((p) => ({ text: p.text, w: 32 + textWidth(p.text, 19, 'bold'), ...(SEERR_PILL[p.color] || SEERR_PILL.gray) }))
  if (pills.length) {
    const w = pills.reduce((sum, p) => sum + p.w, 0) + 12 * (pills.length - 1)
    // shortcut: a squeezed Seerr pill group doesn't wrap onto a second line and the row doesn't clip
    // past the column. Add both if a title ever needs them.
    badges.push({ kind: 'seerr', pills, base: w, min: w })
  }
  if (badges.length) {
    y += 28
    const rowH = Math.max(...badges.map((b) => (b.kind === 'seerr' ? 47 : 38)))
    const widths = shrinkRow(badges, HERO_W, 9)
    let bx = x0
    badges.forEach((b, i) => {
      const w = widths[i]
      if (b.kind === 'seerr') {
        const by = y + (rowH - 47) / 2
        let px = bx
        b.pills.forEach((p, j) => {
          o.rects.push({ k: `badge${i}-${j}`, x: px, y: by, w: p.w, h: 47, r: 9, color: p.fill, bw: 1, bc: p.border })
          text(o, `badgeT${i}-${j}`, px + 16, by + 7, p.text, 19, 'bold', p.ink, { lh: 33 })
          px += p.w + 12
        })
      } else {
        const by = y + (rowH - 38) / 2
        const lines = w < b.base ? wrapLines(b.text, 13, 'bold', w - 22) : [b.text]
        o.rects.push({ k: `badge${i}`, x: bx, y: by, w, h: 38, r: 6, color: b.fill })
        lines.forEach((ln, j) => text(o, `badgeT${i}-${j}`, bx + 11, by + 4 + (30 - lines.length * 13) / 2 + j * 13, ln, 13, 'bold', '#ffffffff', { lh: 13 }))
      }
      bx += w + 9
    })
    // With the facts line under them the two read as one block, so it sits 14px closer.
    y += rowH + (d.meta.length ? 14 : 0)
  }

  // The facts line, a dot between each, wrapping 6px across and 7px down.
  if (d.meta.length) {
    const dotW = textWidth('·', 16, 'medium')
    let mx = 0
    let line = 0
    const place = (k, str, w, color) => {
      if (mx && mx + w > HERO_W) {
        mx = 0
        line++
      }
      text(o, k, x0 + mx, y + line * 24.6, str, 16, 'medium', color, { lh: 17.6 })
      mx += w + 6
    }
    d.meta.forEach((piece, i) => {
      if (i) place(`metaDot${i}`, '·', dotW, '#ffffff66')
      place(`meta${i}`, piece, textWidth(piece, 16, 'medium'), '#ffffffa8')
    })
    y += (line + 1) * 24.6 - 7
  }

  // The incomplete line, 8px under the facts.
  if (d.incomplete) {
    y += 8
    text(o, 'incomplete', x0, y, d.incomplete, 20, 'bold', '#e0a33cff', { lh: 33, maxw: HERO_W, ellipsis: true })
    y += 33
  }

  // What the file is: the codec chips and its size, wrapping 7px apart.
  if (d.tech.length) {
    let cx = 0
    let line = 0
    d.tech.forEach((label, i) => {
      const w = 22 + textWidth(label, 12.5, 'bold', 0.1)
      if (cx && cx + w > HERO_W) {
        cx = 0
        line++
      }
      const cy = y + line * 31.5
      o.rects.push({ k: `chip${i}`, x: x0 + cx, y: cy, w, h: 24.5, r: 6, color: '#ffffff09', bw: 1, bc: '#ffffff1a' })
      text(o, `chipT${i}`, x0 + cx + 11, cy + 6, label, 12.5, 'bold', '#ffffffb3', { lh: 12.5, ls: 0.1 })
      cx += w + 7
    })
    y += (line + 1) * 31.5 - 7
  }

  // An empty ratings row's margin folds into the next one's, as CSS margins collapse.
  if (!d.isPerson && d.ratings.length) {
    y += 15
    y += ratingsRow(o, d.ratings, x0, y, HERO_W, d.ratingStyle, t)
  }

  let overview = null
  if (d.overview) {
    y += 22
    overview = { x: x0, y, box: d.overview.box }
    y += overviewHeight(d.overview.box, d.overview.expanded, d.overview.focused)
  }
  const actionsY = y + 36
  return { ...finish(o), overview, actionsY, bottom: actionsY + 75 }
}

// The skeleton Nouveau shows while the record loads.
export const skeletonBoxes = (left, box) => {
  const list = [{ k: 'bg', x: 0, y: 0, w: 1920, h: 648, r: 0, color: { top: '#ffffff1e', bottom: '#ffffff00' } }]
  const add = (k, x, y, w, h, r) => list.push({ k, x, y, w, h, r, color: box })
  add('genres', left, 56, 300, 15, 3)
  add('logo', left, 88, 480, 106, 8)
  ;[63, 36, 84, 72, 63].reduce((x, w, i) => {
    add(`m${i}`, x, 208, w, 16, 4)
    return x + w + 13
  }, left)
  add('play', left, 260, 179, 78, 39)
  ;[0, 1, 2, 3].forEach((i) => add(`c${i}`, left + 179 + 12 + i * 86, 262, 74, 74, 37))
  add('rail', left, 402, 135, 30, 4)
  ;[0, 1, 2, 3, 4].forEach((i) => {
    add(`card${i}`, left + i * 437, 472, 397, 223, 16)
    add(`cap${i}`, left + i * 437, 705, 231, 17, 4)
  })
  return list
}
