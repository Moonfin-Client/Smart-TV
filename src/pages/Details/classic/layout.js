// Classic laid out as plain lists of boxes, images and text lines, plus the action tiles and the
// section rows. Every number is in 1920x1080 pixels.
import $L from '../../../services/i18n.js'
import { cssShift, fontFor } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { arrange } from '../../../utils/buttonLayout.js'
import { DETAIL_METADATA } from '../../../utils/detailMetadataLayout.js'
import { ratingsRow } from '../modern/hero.js'
import { SEERR_PILL } from '../modern/meta.js'
import { drawAnimePills } from '../detailMarks.js'
import { PILL_H } from '../../../ui/components/player/animePills.js'

export const PAD_TOP = 116
export const PAD_BOTTOM = 58

// The content's left edge beside the classic sidebar's rail, Reel and Mosaic's control, or nothing.
export const classicLeft = (room) => (room === 'rail' ? 174 : room === 'control' ? 120 : 70)

const BULLET = '•'
// Two vertical margins that meet collapse into one, the larger positive less the most negative.
export const collapse = (a, b) => Math.max(a, b, 0) + Math.min(a, b, 0)

export const list = () => ({ rects: [], imgs: [], texts: [] })

// The renderer ends a clipped line at a word, so lines that clip are cut here first, with the
// ellipsis right after the last glyph that fits.
export const clip = (str, size, weight, maxW) => {
  const s = String(str == null ? '' : str)
  if (textWidth(s, size, weight) <= maxW) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (textWidth(`${s.slice(0, mid)}\u2026`, size, weight) <= maxW) lo = mid
    else hi = mid - 1
  }
  return `${s.slice(0, lo)}\u2026`
}

export const text = (out, k, x, y, str, size, weight, color, extra) => {
  out.texts.push({
    k, x: Math.round(x * 100) / 100, y: y + cssShift(size), text: String(str), size, font: fontFor(String(str), weight), color,
    lh: 33, maxw: 0, maxlines: 1, ls: 0, ellipsis: false, align: 'left', ...extra,
  })
}
export const rect = (out, r) => out.rects.push({ r: 0, bw: 0, bc: '#00000000', shadow: null, ...r })
export const img = (out, im) => out.imgs.push({ r: 0, fit: 'cover', color: '#ffffffff', ...im })

// The facts line's pieces, in the viewer's Metadata Row order.
const metaItems = (d) => {
  const it = d.item
  const t = it.Type
  const isSeries = t === 'Series'
  const out = []
  if (d.techSize) out.push({ kind: 'text', text: d.techSize })
  const order = arrange(DETAIL_METADATA, { order: d.settings.detailMetadataOrderTv, hidden: d.settings.hiddenDetailMetadataTv })
  order.forEach((def) => {
    switch (def.id) {
      case 'year':
        if (d.year) out.push({ kind: 'text', text: String(d.year) })
        break
      case 'parentalRating':
        if (d.officialRating) out.push({ kind: 'badge', text: d.officialRating, fill: 'rating' })
        break
      case 'runtimeAndSeasons':
        if (isSeries && d.seasonCount > 0) out.push({ kind: 'text', text: `${d.seasonCount} ${d.seasonCount !== 1 ? $L('Seasons') : $L('Season')}` })
        else if (d.runtime && !isSeries) {
          out.push({ kind: 'text', text: d.runtime })
          if (d.endsAt) out.push({ kind: 'text', text: d.endsAt })
        }
        break
      case 'status':
        if (isSeries && (it.Status === 'Continuing' || it.Status === 'Ended')) {
          out.push({ kind: 'badge', text: it.Status === 'Continuing' ? $L('Continuing') : $L('Ended'), fill: it.Status === 'Continuing' ? 'continuing' : 'ended' })
        }
        break
      case 'upcomingEpisodeDate':
        if (d.upcoming) out.push({ kind: 'badge', text: d.upcoming, fill: 'upcoming', icon: true })
        break
      case 'genres':
        if (d.genres.length) out.push({ kind: 'text', text: d.genres.slice(0, 3).join(' • ') })
        break
      case 'seerrAvailability':
        if (d.seerr && d.seerr.statusPills && d.seerr.statusPills.length) {
          out.push({ kind: 'seerr', pills: d.seerr.statusPills.map((p) => ({ text: p.text, ...(SEERR_PILL[p.color] || SEERR_PILL.gray) })) })
        }
        break
      default:
    }
  })
  return out
}

// The upcoming badge keeps its blue on every theme.
const BADGE_FILL = { rating: null, continuing: '#2e7d32ff', ended: '#b71c1cff', upcoming: '#00a4dcff' }

// Each item after the first is led by a bullet, wrapped with 6px between lines.
// Returns the items placed relative to the block's top left, and its size.
const placeInfoItems = (items, maxW) => {
  const bulletW = 7 + textWidth(BULLET, 17, 'bold') + 7
  const sized = items.map((p, i) => {
    const lead = i > 0 ? bulletW : 0
    let w
    let h = 33
    if (p.kind === 'text') w = textWidth(p.text, 17, 'bold')
    else if (p.kind === 'badge') {
      w = 18 + textWidth(p.text, 16, p.fill === 'rating' ? 'medium' : 'bold') + (p.icon ? 22 : 0)
      h = 39
    } else {
      w = p.pills.reduce((sum, pill, j) => sum + (j ? 12 : 0) + 32 + textWidth(pill.text, 19, 'bold'), 0)
      h = 47
    }
    return { p, lead, w, h }
  })
  const lines = []
  let line = []
  let x = 0
  sized.forEach((it) => {
    if (line.length && x + it.lead + it.w > maxW) {
      lines.push(line)
      line = []
      x = 0
    }
    line.push({ ...it, x })
    x += it.lead + it.w
  })
  if (line.length) lines.push(line)
  let y = 0
  let width = 0
  const placed = []
  lines.forEach((ln) => {
    const lh = Math.max(...ln.map((it) => it.h)) + 6
    ln.forEach((it) => placed.push({ ...it, y: y + (lh - it.h - 6) / 2 }))
    const last = ln[ln.length - 1]
    width = Math.max(width, last.x + last.lead + last.w)
    y += lh
  })
  return { placed, w: width, h: Math.max(0, y - 6) }
}

const drawInfoItems = (out, placed, x0, y0, t) => {
  placed.forEach((it, i) => {
    const k = `info${i}`
    let x = x0 + it.x
    const y = y0 + it.y
    if (it.lead) {
      text(out, `${k}b`, x + 7, y + (it.h - 33) / 2, BULLET, 17, 'bold', t.os(0.5))
      x += it.lead
    }
    const p = it.p
    if (p.kind === 'text') text(out, k, x, y, p.text, 17, 'bold', t.os(0.9))
    else if (p.kind === 'badge') {
      const fill = p.fill === 'rating' ? t.os(0.15) : BADGE_FILL[p.fill]
      rect(out, { k: `${k}r`, x, y, w: it.w, h: 39, r: t.isPixel ? 0 : 6, color: fill })
      let tx = x + 9
      if (p.icon) {
        img(out, { k: `${k}i`, x: tx, y: y + 11.5, w: 16, h: 16, src: 'icons/d/calendar.webp', color: '#ffffffff' })
        tx += 22
      }
      text(out, k, tx, y + 3, p.text, 16, p.fill === 'rating' ? 'medium' : 'bold', p.fill === 'rating' ? t.os(0.9) : '#ffffffff')
    } else {
      let px = x
      p.pills.forEach((pill, j) => {
        const pw = 32 + textWidth(pill.text, 19, 'bold')
        rect(out, { k: `${k}p${j}`, x: px, y, w: pw, h: 47, r: 9, color: pill.fill, bw: 1, bc: pill.border })
        text(out, `${k}t${j}`, px + 16, y + 7, pill.text, 19, 'bold', pill.ink)
        px += pw + 12
      })
    }
  })
}

// The stream chips, 9px apart, wrapping with 6px between lines.
const placeChips = (labels, maxW) => {
  const placed = []
  let x = 0
  let y = 0
  let width = 0
  labels.forEach((label) => {
    const w = 26 + textWidth(label, 16, 'bold')
    if (x > 0 && x + w > maxW) {
      x = 0
      y += 49
    }
    placed.push({ label, x, y, w })
    width = Math.max(width, x + w)
    x += w + 9
  })
  return { placed, w: width, h: labels.length ? y + 43 : 0 }
}

// The header's text column: everything stacked with margins that collapse where they meet. Returns
// its height with the last margin counted.
const infoColumn = (out, d, x0, top, w, t) => {
  const it = d.item
  let y = top
  let mb = 0
  let first = true
  const place = (mt, h, mbNext) => {
    const at = first ? y + mt : y + collapse(mb, mt)
    first = false
    y = at + h
    mb = mbNext
    return at
  }

  // An episode leads with its series and its number.
  if (d.isEpisode && (it.SeriesName || (it.ParentIndexNumber !== undefined && it.IndexNumber !== undefined))) {
    const at = place(0, 39, 6)
    let x = x0
    if (it.SeriesName) {
      text(out, 'series', x, at + 3, it.SeriesName, 23, 'medium', t.os(0.7))
      x += textWidth(it.SeriesName, 23, 'medium') + 12
    }
    if (it.ParentIndexNumber !== undefined && it.IndexNumber !== undefined) {
      const label = `S${it.ParentIndexNumber} E${it.IndexNumber}`
      const pw = 24 + textWidth(label, 16, 'bold')
      // Neon Pulse edges it in pink.
      rect(out, { k: 'epPill', x, y: at, w: pw, h: 39, r: t.isPixel ? 0 : 17, color: t.os(0.15), ...(t.neon ? { bw: 1, bc: '#ff2e9280' } : null) })
      text(out, 'epNum', x + 12, at + 3, label, 16, 'bold', t.os(0.9))
    }
  }

  if (d.logo) {
    const at = place(0, d.logo.h, 17)
    img(out, { k: 'logo', x: x0, y: at, w: d.logo.w, h: d.logo.h, src: d.logo.url, fit: 'contain', logo: true })
  } else {
    const lines = wrapLines(d.name, 46, 'bold', w)
    const at = place(0, lines.length * 57.5, 12)
    lines.forEach((ln, i) => text(out, `title${i}`, x0, at + i * 57.5, ln, 46, 'bold', t.onSurface, { lh: 57.5 }))
  }

  // The facts and the stream chips beside them, or under them when they don't fit.
  const items = placeInfoItems(metaItems(d), w)
  const chips = placeChips(d.techChips, w)
  if (items.placed.length || chips.placed.length) {
    const textBox = items.placed.length ? items.h : 0
    const chipBox = chips.placed.length ? 9 + chips.h : 0
    const sameLine = !items.placed.length || !chips.placed.length || items.w + chips.w <= w
    const rowH = sameLine ? Math.max(textBox, chipBox) : textBox + chipBox
    const at = place(0, rowH, 12)
    if (items.placed.length) drawInfoItems(out, items.placed, x0, at + (sameLine ? (rowH - textBox) / 2 : 0), t)
    if (chips.placed.length) {
      const cx = x0 + (sameLine && items.placed.length ? items.w : 0)
      const cy = at + (sameLine ? 0 : textBox) + 9
      chips.placed.forEach((c, i) => {
        rect(out, { k: `chip${i}`, x: cx + c.x, y: cy + c.y, w: c.w, h: 43, r: 6, color: '#00000001', bw: 1, bc: '#ffffff4d' })
        text(out, `chipT${i}`, cx + c.x + 13, cy + c.y + 5, c.label, 16, 'bold', '#ffffffcc')
      })
    }
  }

  // The incomplete line and the anime markers go under the facts.
  if (d.incomplete) {
    const at = place(8, 33, 0)
    text(out, 'incomplete', x0, at, d.incomplete, 20, 'bold', '#e0a33cff')
  }
  if (d.anime && (d.anime.marker || d.anime.audio)) {
    const at = place(9, PILL_H, 0)
    drawAnimePills(out, 'anime', d.anime.marker, d.anime.audio, x0, at)
  }

  // The ratings, with the -6px the wrapped row hangs below its last line.
  if (d.ratings.length) {
    const at = place(0, 0, 0)
    const h = ratingsRow(out, d.ratings, x0, at, w, d.ratingStyle, t)
    y = at + h + 6
    mb = -6
  }

  if (!d.hideDescription) {
    if (d.tagline) {
      const lines = wrapLines(`“${d.tagline}”`, 20, 'regular', w)
      const at = place(9, lines.length * 28, 12)
      lines.forEach((ln, i) => text(out, `tagline${i}`, x0, at + i * 28, ln, 20, 'regular', t.os(0.7), { lh: 28, italic: true }))
    }
    if (d.overview) {
      const box = overviewBox(d.overview, w)
      // An opened box grows the header, which pushes the poster and everything under it down.
      const at = place(12, overviewH(box, Boolean(d.overviewExpanded)), 0)
      d.overviewAt = { x: x0, y: at, box }
    }
  }
  return y + mb - top
}

// The overview: 20px at 1.4, plain when it fits four lines, else a box with 17px of padding and
// Read More under it.
const OV_LH = 28
const overviewBox = (prose, width) => {
  const plain = wrapLines(prose, 20, 'regular', width).length
  const canToggle = plain > 4
  const textW = canToggle ? width - 36 : width
  return { canToggle, textW, lines: canToggle ? wrapLines(prose, 20, 'regular', textW).length : plain, width }
}
export const overviewH = (box, expanded) => {
  if (!box.canToggle) return box.lines * OV_LH
  const full = 36 + box.lines * OV_LH + 12 + 33
  return expanded ? Math.min(319, full) : 36 + 4 * OV_LH + 12 + 33
}

// The poster beside the text, and its watched and favorite marks. Pixel themes square it off.
export const poster = (out, d, x, y, w, h, t, round = 12) => {
  const r = t.isPixel ? 0 : round
  rect(out, { k: 'posterBg', x, y, w, h, r, color: d.posterBg || t.os(0.05), shadow: d.posterShadow || { color: '#00000080', x: 0, y: 8, blur: 32, spread: 0 } })
  if (d.posterUrl) img(out, { k: 'poster', x, y, w, h, r, src: d.posterUrl })
  else img(out, { k: 'posterPh', x: x + (w - 64) / 2, y: y + (h - 64) / 2, w: 64, h: 64, src: d.posterIcon || 'icons/d/movieOutlined.webp', color: '#ffffff26' })
  const ud = d.item.UserData || {}
  if (ud.IsFavorite) badgeDot(out, 'posterFav', x + 8, y + 8, 30, t.recordingActive, 'icons/cls_heart.webp', 16, t.onBadge)
  if (ud.Played) badgeDot(out, 'posterWatched', x + w - 8 - 30, y + 8, 30, t.badgeWatched, 'icons/cls_check_compact.webp', 16, t.onBadge)
}

// A round mark, a 28px fill in a 1px ring. It goes in the image layer as two plain discs, since the
// box layer draws under the poster it sits on. The ring and the icon take the theme's badge ink.
export const badgeDot = (out, k, x, y, size, fill, icon, iconSize, ink = '#ffffffff') => {
  img(out, { k: `${k}o`, x, y, w: size, h: size, r: size / 2, src: '', color: ink })
  img(out, { k: `${k}r`, x: x + 1, y: y + 1, w: size - 2, h: size - 2, r: size / 2 - 1, src: '', color: fill })
  img(out, { k: `${k}i`, x: x + (size - iconSize) / 2, y: y + (size - iconSize) / 2, w: iconSize, h: iconSize, src: icon, color: ink })
}

// The header row: the text column and the poster, bottom aligned.
export const layoutHeader = (out, d, left, contentW, t) => {
  const showsPoster = d.showsSection('poster')
  const landscape = d.isEpisode
  const pw = landscape ? 406 : 239
  const ph = landscape ? 229 : 360
  const infoW = showsPoster ? contentW - 46 - pw : contentW
  const probe = list()
  const probeD = { ...d }
  const infoH = infoColumn(probe, probeD, 0, 0, infoW, t)
  const headerH = Math.max(infoH, showsPoster ? ph : 0)
  const infoTop = PAD_TOP + headerH - infoH
  const shifted = { ...d }
  infoColumn(out, shifted, left, infoTop, infoW, t)
  if (showsPoster) poster(out, d, left + infoW + 46, PAD_TOP + headerH - ph, pw, ph, t)
  return { bottom: PAD_TOP + headerH, overview: shifted.overviewAt || null, infoW }
}

// The action tiles: 157px wide with 9px and 6px around each, wrapped and centered, every line as
// tall as its tallest tile. With Action Buttons on Screen at All they stay on one line from the left,
// 40px in.
const BTN_STEP = 169
// A tile label's word too long for its line splits where it runs out.
// shortcut: what's left of a split word takes a line of its own rather than running on with the next
// word. Fix it once a label has a word past 157px with more after it.
export const breakLong = (lines, size, weight, maxW) =>
  lines.reduce((out, line) => {
    let rest = line
    while (rest.length > 1 && textWidth(rest, size, weight) > maxW) {
      let n = rest.length - 1
      while (n > 1 && textWidth(rest.slice(0, n), size, weight) > maxW) n--
      out.push(rest.slice(0, n))
      rest = rest.slice(n)
    }
    out.push(rest)
    return out
  }, [])
export const layoutButtons = (buttons, left, contentW, top, oneLine) => {
  const perLine = oneLine ? buttons.length || 1 : Math.max(1, Math.floor(contentW / BTN_STEP))
  const placed = []
  let y = top
  for (let i = 0; i < buttons.length; i += perLine) {
    const line = buttons.slice(i, i + perLine)
    const sized = line.map((b) => {
      const labelLines = breakLong(wrapLines(b.label, 16, 'bold', 157), 16, 'bold', 157)
      const h = 86 + 12 + labelLines.length * 20.8 + (b.detail ? 2 + 33 : 0)
      return { ...b, labelLines, h }
    })
    const lh = Math.max(...sized.map((b) => b.h)) + 18
    const x0 = oneLine ? left + 40 + 6 : left + (contentW - line.length * BTN_STEP) / 2 + 6
    sized.forEach((b, j) => placed.push({ ...b, x: x0 + j * BTN_STEP, y: y + 9, line: i / perLine, col: j }))
    y += lh
  }
  return { placed, h: y - top }
}

// The metadata strip's cells: genres, director, writers and studio, the ones the item has.
export const metadataCells = (item, showsCrew, showsStudios) => {
  const genres = item.Genres || []
  const isEpisode = item.Type === 'Episode'
  const people = item.People || []
  const directors = showsCrew ? people.filter((p) => p.Type === 'Director') : []
  const writers = showsCrew ? people.filter((p) => p.Type === 'Writer') : []
  const studios = showsStudios ? item.Studios || [] : []
  const out = []
  if (genres.length) out.push({ label: $L('Genres'), value: genres.slice(0, 3).join(', ') })
  if (directors.length) out.push({ label: isEpisode ? $L('Episode Director') : $L('Director'), value: directors.map((p) => p.Name).join(', ') })
  if (writers.length) out.push({ label: isEpisode ? $L('Episode Writer') : $L('WRITERS'), value: writers.map((p) => p.Name).join(', ') })
  if (studios.length) out.push({ label: $L('Studio'), value: studios.map((s) => s.Name).join(', ') })
  return out
}

export const layoutMetadata = (out, cells, left, contentW, top) => {
  rect(out, { k: 'metaBox', x: left, y: top, w: contentW, h: 100, r: 12, color: '#ffffff08', bw: 1, bc: '#ffffff0f' })
  const cw = (contentW - 2) / cells.length
  cells.forEach((c, i) => {
    const x = left + 1 + i * cw
    if (i < cells.length - 1) rect(out, { k: `metaSep${i}`, x: Math.round(x + cw - 1), y: top + 1, w: 1, h: 98, color: '#ffffff26' })
    text(out, `metaL${i}`, x + 20, top + 15, String(c.label).toUpperCase(), 15, 'bold', '#ffffff66', { ls: 0.5 })
    const vw = cw - 40 - (i < cells.length - 1 ? 1 : 0)
    text(out, `metaV${i}`, x + 20, top + 52, clip(c.value, 19, 'regular', vw), 19, 'regular', '#ffffffd9', { maxw: vw + 20 })
  })
  return 100
}
