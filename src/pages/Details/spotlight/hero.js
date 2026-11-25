// Spotlight's hero column, as the same box, image and text lists Modern's hero hands the page. Its
// pieces stack 10px apart: the tagline, the logo or title (an episode's series slot above its name,
// a person's photo beside theirs), the facts line, the technical line, the ratings, the overview and
// the action row.
import { cssShift, fontFor } from '../../../ui/text.js'
import { textWidth } from '../../../ui/components/details/measure.js'
import { overviewBox, overviewHeight, ratingsRow } from '../modern/hero.js'
import { SEERR_PILL } from '../modern/meta.js'

const GAP = 10
const DOT = '·'
const NO_BORDER = '#00000000'

const text = (out, k, x, y, str, size, weight, color, extra) => {
  out.texts.push({ k, x: Math.round(x * 100) / 100, y: y + cssShift(size), text: str, size, font: fontFor(str, weight), color, lh: 0, maxw: 0, maxlines: 0, ls: 0, rich: false, ...extra })
}

// The facts line: 21px pieces with a dim dot between neighbors, a clock for the runtime, a status
// or upcoming date as a 17px pill, and Seerr's pills, which sit outside the dotted run.
const metaRow = (out, pieces, seerrPills, x0, y0, maxW) => {
  const color = '#ffffffbf'
  const dotW = 8 + textWidth(DOT, 21) + 8
  const items = pieces.map((p, i) => {
    const prev = pieces[i - 1]
    const lead = i > 0 && p.kind !== 'seerr' && prev.kind !== 'seerr' ? dotW : 0
    let w
    let h = 33
    if (p.kind === 'runtime') w = 18 + 4
    else if (p.kind === 'status') {
      w = 16 + textWidth(p.text, 17, 'bold')
      h = 37
    } else if (p.kind === 'upcoming') {
      w = 8 + 16 + 6 + textWidth(p.text, 17, 'bold') + 8
      h = 37
    } else if (p.kind === 'seerr') {
      w = seerrPills.reduce((sum, pill, j) => sum + (j ? 12 : 0) + 32 + textWidth(pill.text, 19, 'bold'), 0)
      h = 47
    } else w = textWidth(p.text, 21)
    return { p, lead, w, h }
  }).filter((it) => it.w > 0)
  const lines = []
  let line = []
  let x = 0
  items.forEach((it) => {
    const need = it.lead + it.w
    if (line.length && x + need > maxW) {
      lines.push(line)
      line = []
      x = 0
    }
    line.push({ ...it, x })
    x += need
  })
  if (line.length) lines.push(line)
  let y = y0
  lines.forEach((ln, li) => {
    const lh = Math.max(...ln.map((it) => it.h))
    ln.forEach((it, ii) => {
      const k = `m${li}-${ii}`
      let ix = x0 + it.x
      const iy = y + (lh - it.h) / 2
      if (it.lead) {
        text(out, `${k}d`, ix + 8, y + (lh - 33) / 2, DOT, 21, 'regular', '#ffffff66', { lh: 33 })
        ix += it.lead
      }
      const p = it.p
      if (p.kind === 'runtime') {
        // The runtime draws as the clock alone, without its text.
        out.imgs.push({ k: `${k}i`, x: ix, y: iy + 7.5, w: 18, h: 18, src: 'icons/d/schedule.webp', color })
      } else if (p.kind === 'status' || p.kind === 'upcoming') {
        out.rects.push({ k: `${k}r`, x: ix, y: iy, w: it.w, h: 37, r: 4, color: p.kind === 'upcoming' ? '#00a4dcff' : p.ended ? '#b71c1cff' : '#2e7d32ff' })
        let tx = ix + 8
        if (p.kind === 'upcoming') {
          out.imgs.push({ k: `${k}i`, x: tx, y: iy + 10.5, w: 16, h: 16, src: 'icons/d/calendar.webp', color: '#ffffffff' })
          tx += 22
        }
        text(out, k, tx, iy + 2, p.text, 17, 'bold', '#ffffffff', { lh: 33 })
      } else if (p.kind === 'seerr') {
        let px = ix
        seerrPills.forEach((pill, j) => {
          const pw = 32 + textWidth(pill.text, 19, 'bold')
          out.rects.push({ k: `${k}p${j}`, x: px, y: iy, w: pw, h: 47, r: 9, color: pill.fill, bw: 1, bc: pill.border })
          text(out, `${k}t${j}`, px + 16, iy + 7, pill.text, 19, 'bold', pill.ink, { lh: 33 })
          px += pw + 12
        })
      } else {
        text(out, k, ix, iy, p.text, 21, 'regular', color, { lh: 33 })
      }
    })
    y += lh
  })
  return y - y0
}

// The file size and the codec chips, 8px apart and wrapping.
const techRow = (out, size, chips, x0, y0, maxW, t) => {
  const items = []
  if (size) items.push({ kind: 'size', text: size, w: textWidth(size, 19, 'bold'), h: 33 })
  chips.forEach((label) => items.push({ kind: 'chip', text: label, w: 18 + textWidth(label, 17), h: 41 }))
  let x = 0
  let y = y0
  let line = []
  const flush = () => {
    const lh = Math.max(...line.map((it) => it.h))
    line.forEach((it, i) => {
      const iy = y + (lh - it.h) / 2
      const k = `t${y}-${i}`
      if (it.kind === 'size') text(out, k, x0 + it.x, iy, it.text, 19, 'bold', t && t.os ? t.os(0.75) : '#ffffffbf', { lh: 33 })
      else {
        out.rects.push({ k: `${k}r`, x: x0 + it.x, y: iy, w: it.w, h: 41, r: 4, color: '#00000001', bw: 1, bc: '#ffffff4d' })
        text(out, k, x0 + it.x + 9, iy + 4, it.text, 17, 'regular', '#ffffffd9', { lh: 33 })
      }
    })
    y += lh
    line = []
    x = 0
  }
  items.forEach((it) => {
    if (line.length && x + it.w > maxW) flush()
    line.push({ ...it, x })
    x += it.w + 8
  })
  if (line.length) flush()
  return items.length ? y - y0 : 0
}

// `[ Version ]` beside the logo or title when the title has more than one version.
const versionBadge = (out, label, x, y, h, t) => {
  const w = 18 + textWidth(label, 16, 'bold')
  const by = y + (h - 26.4) / 2
  out.rects.push({ k: 'ver', x, y: by, w, h: 26.4, r: 4, color: '#6ea8fe26', bw: 1, bc: '#6ea8fe80' })
  text(out, 'verT', x + 9, by + 4, label, 16, 'bold', t.accent, { lh: 18.4 })
  return w
}

// `d` carries what the page worked out. The result is the draw lists, where the overview and the
// action row go, and where the column ends.
export const layoutSpotlightHero = (d, t) => {
  const out = { rects: [], imgs: [], texts: [] }
  const x0 = d.x0
  const W = d.W
  let y = d.y0
  let first = true
  const at = () => {
    const top = first ? y : y + GAP
    first = false
    return top
  }

  if (d.person) {
    const top = at()
    const infoH = 59.8 + (d.born ? 6 + 33 : 0)
    const rowH = Math.max(d.avatar ? 126 : 0, infoH)
    let ix = x0
    if (d.avatar) {
      const ay = top + (rowH - 126) / 2
      out.imgs.push({ k: 'avatar', x: x0 + 3, y: ay + 3, w: 120, h: 120, src: d.avatar, r: 60, fit: 'cover', color: '#ffffffff' })
      out.rects.push({ k: 'avatarRing', x: x0, y: ay, w: 126, h: 126, r: 63, color: '#00000001', bw: 3, bc: d.ringColor })
      ix += 126 + 24
    }
    const iy = top + (rowH - infoH) / 2
    text(out, 'title', ix, iy, d.title, 52, 'bold', '#ffffffff', { lh: 59.8, maxw: x0 + W - ix, maxlines: 1 })
    if (d.born) text(out, 'born', ix, iy + 59.8 + 6, d.born, 20, 'regular', '#ffffffb3', { lh: 33 })
    y = top + rowH
  } else {
    if (d.tagline) {
      const top = at()
      text(out, 'tagline', x0, top, d.tagline.toUpperCase(), 18, 'bold', t.accent, { lh: 33, ls: 3, maxw: W, maxlines: 1 })
      y = top + 33
    }
    if (d.episode) {
      // The series slot keeps 72px whether the logo has landed, failed or never existed.
      const top = at()
      if (d.logo) {
        if (d.logo.w) {
          out.imgs.push({ k: 'logo', x: x0, y: top + 72 - d.logo.h, w: d.logo.w, h: d.logo.h, src: d.logo.url, color: '#ffffffff', fit: 'contain', logo: true })
          if (d.version) versionBadge(out, d.version, x0 + d.logo.w + 14, top + 72 - d.logo.h, d.logo.h, t)
        }
      } else if (d.seriesLabel) {
        text(out, 'series', x0, top + 39, d.seriesLabel, 22, 'regular', '#ffffffb3', { lh: 33, ls: 1, maxw: W, maxlines: 1 })
        if (d.version) versionBadge(out, d.version, x0 + Math.min(W, textWidth(d.seriesLabel, 22) + d.seriesLabel.length) + 14, top + 39, 33, t)
      }
      y = top + 72
      const ty = at()
      text(out, 'title', x0, ty, d.title, 52, 'bold', '#ffffffff', { lh: 59.8, maxw: W, maxlines: 1 })
      if (!d.logo && !d.seriesLabel && d.version) versionBadge(out, d.version, x0 + Math.min(W, textWidth(d.title, 52, 'bold')) + 14, ty, 59.8, t)
      y = ty + 59.8
    } else if (d.logo) {
      if (d.logo.w) {
        const top = at()
        out.imgs.push({ k: 'logo', x: x0, y: top, w: d.logo.w, h: d.logo.h, src: d.logo.url, color: '#ffffffff', fit: 'contain', logo: true })
        if (d.version) versionBadge(out, d.version, x0 + d.logo.w + 14, top, d.logo.h, t)
        y = top + d.logo.h
      }
    } else {
      const top = at()
      text(out, 'title', x0, top, d.title, 52, 'bold', '#ffffffff', { lh: 59.8, maxw: W, maxlines: 1 })
      if (d.version) versionBadge(out, d.version, x0 + Math.min(W, textWidth(d.title, 52, 'bold')) + 14, top, 59.8, t)
      y = top + 59.8
    }
  }

  if (d.meta.length) {
    const top = at()
    y = top + metaRow(out, d.meta, d.seerrPills, x0, top, W)
  }
  // The incomplete line takes an 8px gap in place of the column's 10px.
  if (!d.person && d.incomplete) {
    const top = first ? y : y + 8
    first = false
    text(out, 'incomplete', x0, top, d.incomplete, 20, 'bold', '#e0a33cff', { lh: 33, maxw: W, maxlines: 1 })
    y = top + 33
  }
  if (!d.person && (d.techSize || d.techChips.length)) {
    const top = at()
    y = top + techRow(out, d.techSize, d.techChips, x0, top, W, t)
  }
  if (!d.person && d.ratings.length) {
    const top = at()
    y = top + ratingsRow(out, d.ratings, x0, top, W, d.ratingStyle, t)
  }
  let overview = null
  if (d.overview) {
    const top = at()
    const box = overviewBox(d.overview, Math.min(800, W))
    overview = { x: x0, y: top, box }
    y = top + overviewHeight(box, d.overviewExpanded)
  }
  const actionsY = d.hasActions ? at() : y
  if (d.hasActions) y = actionsY + 75
  // The download bars take a 16px gap in place of the column's 10px.
  const downloadsY = y + 16
  if (d.downloadsH) y = downloadsY + d.downloadsH
  out.rects = out.rects.map((r) => ({ r: 0, bw: 0, bc: NO_BORDER, ...r }))
  out.imgs = out.imgs.map((im) => ({ r: 0, fit: 'cover', ...im }))
  return { ...out, overview, actionsY, downloadsY, bottom: y }
}

export const seerrPillsOf = (seerr) => (seerr && seerr.isActive && seerr.statusPills && seerr.statusPills.length
  ? seerr.statusPills.map((p) => ({ text: p.text, ...(SEERR_PILL[p.color] || SEERR_PILL.gray) }))
  : [])

