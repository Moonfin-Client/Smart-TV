// The Home rows preview laid out the way CSS flows it, as positioned boxes for HomePreview to draw.
// Text without a line height of its own sits on a 33px line.
import $L from '../../../services/i18n.js'
import { textWidth, cssShift } from '../../text.js'
import { homeRowSpacing } from '../home/modernCardLayout.js'
import { classicShape, rowImageType } from '../home/rowPeek.js'
import { rowCardHeights } from './mediaBarMath.js'
import { metaLayout } from './mediaBarKit.js'
import { ROW_LEFT_INSET, ROW_SCALE, SAMPLE_PILLS, itemAt, metaParts } from './kit.js'

const LINE = 33
const SHAPE_ASPECT = { portrait: 2 / 3, landscape: 16 / 9, square: 1, banner: 1168 / 216 }
const SQUARE_ITEM_TYPES = ['MusicAlbum', 'Audio']
const isWideShape = (shape) => shape === 'landscape' || shape === 'banner'
const growsOnFocus = (item) => Boolean(item.year || item.genres.length || item.runtimeMinutes || item.communityRating) ||
  ['Movie', 'Series', 'Episode', 'CollectionFolder'].indexOf(item.type) >= 0

// The panel's facts: a show's runtime is an episode's, which Home's panel leaves off.
const panelParts = (item) => metaParts(item.type === 'Series' ? { ...item, runtimeMinutes: null } : item)

// Every box a layout collects: cards, rings, bars, badges, texts, chips, ratings, panels, pills.
const newOut = () => ({ cards: [], rings: [], bars: [], badges: [], texts: [], chips: [], ratings: [], panels: [], pills: [], band: null })

const text = (out, k, value, x, y, size, weight, color, extra) => {
  out.texts.push({ k, text: value, x, y: y + cssShift(size), size, weight, color, maxw: 0, lines: 1, lh: LINE, ...extra })
}

const meta = (out, k, item, x, y, maxW, color) => {
  const m = metaLayout(metaParts(item), item.officialRating, maxW)
  m.texts.forEach((tx) => out.texts.push({ k: k + tx.k, text: tx.text, x: x + tx.x, y: y + tx.y, size: tx.size, weight: 'bold', color, maxw: 0, lines: 1, lh: LINE }))
  m.chips.forEach((c) => out.chips.push({ k: k + c.k, x: x + c.x, y: y + c.y, w: c.w, h: c.h }))
  return m.h
}

// The watched indicators on a card at x, y of w by h. [progress] runs from 0 to 1.
const indicators = (out, k, item, progress, x, y, w, h, s, t) => {
  const behavior = s.watchedIndicatorBehavior || 'always'
  if (!(behavior === 'always' || behavior === 'hideCount' || (behavior === 'episodesOnly' && item.type === 'Episode'))) return
  const count = behavior !== 'hideCount' && !s.hideHomeUnwatchedCount && !item.played && item.unplayedCount > 0
  if (progress > 0 && !s.hideHomeWatchProgress) {
    const bw = w - 12
    out.bars.push({ k: k + 'p', x: x + 6, y: y + h - 12, w: bw, fill: (bw * Math.round(progress * 100)) / 100, fillColor: t.accent, rest: t.scrimA(0.54) })
  }
  if (item.played) out.badges.push({ k: k + 'w', x: x + w - 16, y: y + 4, w: 12, h: 12, check: true, text: '' })
  if (count) {
    const label = String(item.unplayedCount)
    const bw = textWidth(label, 9, 'bold') + 8 + 2
    out.badges.push({ k: k + 'c', x: x + w - 4 - bw, y: y + 4, w: bw, h: 14, check: false, text: label })
  }
}

// One card from its top left. Returns its height, text included.
const card = (out, k, o, x, y, ctx) => {
  const { s, t } = ctx
  const { item, height, aspect, imageUrl, progress, focused, classic, carousel } = o
  const w = height * aspect
  const grown = classic && focused && s.cardFocusZoom
  const textH = carousel ? 0 : 6 + LINE + (item.year ? 2 + LINE : 0)
  out.cards.push({ k, x, y, w, h: height, src: imageUrl || item.posterUrl || '', scale: grown ? 1.05 : 1, pivotY: (height + textH) / 2 / height })
  indicators(out, k, item, progress, x, y, w, height, s, t)
  if (focused) out.rings.push({ k: k + 'r', x: x - 3.5, y: y - 3.5, w: w + 7, h: height + 7 })
  if (!carousel) {
    text(out, k + 't', item.title, x, y + height + 6, 13, 'bold', t.onSurface, { maxw: w, truncate: true })
    if (item.year) text(out, k + 'y', String(item.year), x, y + height + 6 + LINE + 2, 12, 'regular', t.onSurfaceA(0.6))
  }
  return { w, h: height + textH }
}

const focusedCard = (out, k, item, posterHeight, carousel, x, y, ctx) => {
  const { s, t, screenW } = ctx
  const w = (posterHeight * 16) / 9
  out.cards.push({ k, x, y, w, h: posterHeight, src: item.focusUrl || item.backdropUrl || item.posterUrl || '', scale: 1, pivotY: 0.5 })
  indicators(out, k, item, (item.playedPercentage || 0) / 100, x, y, w, posterHeight, s, t)
  out.rings.push({ k: k + 'r', x: x - 3.5, y: y - 3.5, w: w + 7, h: posterHeight + 7 })
  if (carousel) return { w, h: posterHeight }
  let ty = y + posterHeight + 6
  text(out, k + 't', item.title, x, ty, 13, 'bold', t.onSurface, { maxw: w, truncate: true })
  ty += LINE
  if (item.year) {
    text(out, k + 'y', String(item.year), x, ty + 2, 12, 'regular', t.onSurfaceA(0.6))
    ty += 2 + LINE
  }
  ty += 4
  // The ratings and overview run to the end of the row, as on Home.
  const detailsWidth = screenW - ROW_LEFT_INSET - 20
  const zoom = 0.5 * ROW_SCALE
  out.ratings.push({ k: k + 'rt', slot: 'focus', x, y: ty, item, compact: true, single: true, inline: false, zoom, maxW: detailsWidth / zoom })
  if (item.overview && !s.hideHomeMediaDescription) {
    out.texts.push({ k: k + 'o', text: item.overview, x, y: ty + ctx.ratingsH(k + 'rt') + 4 + cssShift(12), size: 12, weight: 'regular', color: t.onSurfaceA(0.7), maxw: detailsWidth, lines: 3, lh: 16.8, truncate: true })
  }
  return { w, h: ty + 76 - y }
}

// The Carousel panel from its top left, [w] wide.
const panel = (out, k, item, x, y, w, ctx) => {
  const { s, t } = ctx
  const textW = w * 0.54
  const backdrop = item.backdropUrl
  const title = item.seriesName || item.title
  const parts = panelParts(item)
  // The panel's text column sets a line height of 1.3, which its facts inherit.
  const m = metaLayout(parts, item.officialRating, textW, (size) => size * 1.3)
  const titleLines = Math.min(2, ctx.lines(title, 22, 'bold', textW))
  const pills = item.type === 'Movie' || item.type === 'Episode'
  const overview = item.overview && !s.hideHomeMediaDescription ? item.overview : ''
  const overW = textW * 0.85
  const overLines = overview ? Math.min(3, ctx.lines(overview, 11, 'regular', overW)) : 0
  // A flex column centered in the 170 tall panel, every line 1.3 high unless set.
  const pillLineH = 8 * 1.3 + 4
  const blockH = titleLines * 23.1 + (item.episodeLine ? 4 + 15.6 : 0) + 5 + m.h + ctx.ratingsH(k + 'rt') + (pills ? 5 + pillLineH : 0) + (overLines ? 4 + overLines * 15.4 : 0)
  let cy = y + (170 - blockH) / 2
  const tx = x + 36
  out.panels.push({ k, x, y, w, h: 170, backdrop: backdrop || '', on: !!backdrop })
  out.texts.push({ k: k + 't', text: title, x: tx, y: cy + cssShift(22), size: 22, weight: 'bold', color: t.onSurface, maxw: textW, lines: 2, lh: 23.1, truncate: true })
  cy += titleLines * 23.1
  if (item.episodeLine) {
    out.texts.push({ k: k + 'e', text: item.episodeLine, x: tx, y: cy + 4 + cssShift(12), size: 12, weight: 'bold', color: t.onSurface, maxw: textW, lines: 1, lh: 15.6, truncate: true })
    cy += 4 + 15.6
  }
  cy += 5
  m.texts.forEach((mt) => out.texts.push({ k: k + mt.k, text: mt.text, x: tx + mt.x, y: cy + mt.y, size: mt.size, weight: 'bold', color: t.onSurfaceA(0.9), maxw: 0, lines: 1, lh: mt.size * 1.3 }))
  m.chips.forEach((c) => out.chips.push({ k: k + c.k, x: tx + c.x, y: cy + c.y, w: c.w, h: c.h }))
  cy += m.h
  out.ratings.push({ k: k + 'rt', slot: 'panel', x: tx, y: cy, item, compact: true, single: true, inline: false, zoom: 0.5, maxW: textW / 0.5 })
  cy += ctx.ratingsH(k + 'rt')
  if (pills) {
    let px = tx
    SAMPLE_PILLS.forEach((label, i) => {
      const pw = textWidth(label, 8, 'bold') + 8 * 0.04 * label.length + 8 + 2
      out.pills.push({ k: k + 'p' + i, label, x: px, y: cy + 5, w: pw, h: pillLineH })
      px += pw + 4
    })
    cy += 5 + pillLineH
  }
  if (overLines) {
    out.texts.push({ k: k + 'o', text: overview, x: tx, y: cy + 4 + cssShift(11), size: 11, weight: 'regular', color: t.onSurfaceA(0.8), maxw: overW, lines: 3, lh: 15.4, truncate: true })
  }
}

// One row at y. Returns its height.
const homeRow = (out, k, o, x0, y, ctx) => {
  const { t, modern, posterHeight, thumbHeight } = ctx
  const { title, items, shape = 'portrait', offset = 0, withFocus = false, real = false, staticCards = false, carousel = false } = o
  const padTop = modern ? 6 : 16
  text(out, k + 'h', title, x0 + 16, y + padTop, 16, 'bold', t.onSurface)
  let cy = y + padTop + LINE + (modern ? 1 : 8) + 5
  let x = x0 + 16
  let tallest = 0
  const count = real ? Math.min(8, items.length) : 8
  for (let i = 0; i < count && x < ctx.colW; i++) {
    const item = real ? items[i] : itemAt(items, i + offset)
    const cardShape = modern ? (staticCards && 'landscape') || (SQUARE_ITEM_TYPES.indexOf(item.type) >= 0 ? 'square' : 'portrait') : shape
    const wide = !modern && isWideShape(cardShape)
    const focused = withFocus && i === 0
    let box
    if (focused && modern && cardShape === 'portrait' && growsOnFocus(item)) {
      box = focusedCard(out, k + 'c' + i, item, posterHeight, carousel, x, cy, ctx)
    } else {
      box = card(out, k + 'c' + i, {
        item,
        height: wide ? thumbHeight : posterHeight,
        aspect: SHAPE_ASPECT[cardShape],
        imageUrl: real ? item.cardUrl : wide ? item.backdropUrl : null,
        progress: real ? item.playedPercentage / 100 : wide && i < 2 ? [0.35, 0.7][i] : 0,
        focused,
        classic: !modern,
        carousel,
      }, x, cy, ctx)
    }
    tallest = Math.max(tallest, box.h)
    x += box.w + 12
  }
  cy += tallest + 5
  if (carousel) {
    panel(out, k + 'pn', real ? items[0] : itemAt(items, offset), x0 + 16, cy + 4, ctx.colW - x0 - 16 - 20, ctx)
    cy += 4 + 170 + 35
  }
  return cy - y
}

// The ctx every part reads: s, t, modern, posterHeight, thumbHeight, colW (the column's width),
// screenW (the screen's), ratingsH(key), the drawn height of the ratings row a layout keyed, and
// lines(text, size, weight, maxW).
const baseCtx = (s, t, modern, colW, screenW, ratingsH, lines) => ({ s, t, modern, colW, screenW, ratingsH, lines, ...rowCardHeights(s, modern) })

// The rows column from its top left (its 64 of left padding and 16 of top padding
// included). [rows] are Home's own rows, or null for the three sample ones. [carousel] left
// undefined follows Row Type.
export const rowsColumn = ({ s, t, items, rows, modern, focusFirst = false, carousel: carouselStyle, colW, screenW, ratingsH, lines }) => {
  const out = newOut()
  const ctx = baseCtx(s, t, modern, colW, screenW, ratingsH, lines)
  const carousel = modern && (carouselStyle !== undefined && carouselStyle !== null ? carouselStyle : s.homeRowsStyle === 'carousel')
  const rowSettings = { ...s, homeRowsStyle: modern ? 'v2' : 'v1' }
  const spacing = homeRowSpacing(rowSettings)
  const rowGap = spacing === null ? 540 : spacing / 2
  const sampleShape = (row, cardType) => classicShape(cardType, rowImageType(row, rowSettings))
  const x0 = ROW_LEFT_INSET - 16
  let y = 16
  const first = rows ? rows[0].items[0] : items[0]
  if (!modern && s.homeRowOverlay !== false && first) {
    // Classic keeps the info overlay band above the rows while Home Row Info Overlay is on.
    const bx = x0 + 16
    const by = y + 24
    const bw = colW - x0 - 32
    const band = newOut()
    text(band, 'bt', first.title, bx, by, 26, 'bold', t.onSurface, { maxw: bw, truncate: true })
    let cy = by + LINE + 6
    cy += meta(band, 'bm', first, bx, cy, bw, t.onSurfaceA(0.9))
    // The ratings' 6px top margin collapses into the inline row's own 12px at half zoom, which
    // RatingsRow already draws.
    band.ratings.push({ k: 'brt', slot: 'band', x: bx, y: cy, item: first, compact: false, single: false, inline: true, zoom: 0.5, maxW: bw / 0.5 })
    cy += ratingsH('brt')
    if (first.overview && !s.hideHomeMediaDescription) {
      band.texts.push({ k: 'bo', text: first.overview, x: bx, y: cy + 8 + cssShift(13), size: 13, weight: 'regular', color: t.onSurfaceA(0.7), maxw: bw, lines: 2, lh: 18.2, truncate: true })
    }
    out.band = { x: bx, y: by, w: bw, h: 145, ...band }
    y += 24 + 145 + 12
  }
  if (rows) {
    rows.forEach((row, index) => {
      if (index > 0) y += rowGap
      y += homeRow(out, 'r' + index, { real: true, title: row.title, items: row.items, shape: row.shape, staticCards: row.staticCards, carousel: row.carousel, withFocus: focusFirst && index === 0 }, x0, y, ctx)
    })
  } else {
    const sample = [
      { title: $L('Continue Watching'), shape: sampleShape({ id: 'resume' }, 'landscape'), withFocus: focusFirst },
      { title: $L('Recently Added'), shape: sampleShape({ isLatestRow: true }, 'portrait'), offset: 3 },
      { title: $L('Next Up'), shape: sampleShape({ id: 'nextup' }, 'landscape'), offset: 6 },
    ]
    sample.forEach((row, index) => {
      if (index > 0) y += rowGap
      if (y < 540 * 2) y += homeRow(out, 'r' + index, { ...row, items, carousel }, x0, y, ctx)
    })
  }
  return out
}

// The peek row: Home's first row (or the sample Continue Watching) from the top of its box.
export const peekRow = ({ s, t, items, row, modern, colW, screenW, ratingsH, lines }) => {
  const out = newOut()
  const ctx = baseCtx(s, t, modern, colW, screenW, ratingsH, lines)
  const real = Boolean(row.items)
  homeRow(out, 'pk', { real, title: row.title, items: row.items || items, shape: row.shape, staticCards: row.staticCards }, ROW_LEFT_INSET - 16, 0, ctx)
  return out
}

// The nav and rows stand-ins drawn while the sample items load, on their 320 by 200 box:
// { k, x, y, w, h, r, c }.
const bar = (k, x, y, w, h, c) => ({ k, x, y, w, h, r: h / 2, c })
const poster = (k, x, y, w, c) => ({ k, x, y, w, h: w * 1.5, r: 3, c })

export const navbarFallback = (position, t) => {
  const strong = t.onSurfaceA(0.78)
  const weak = t.onSurfaceA(0.3)
  const posterC = t.onSurfaceA(0.16)
  const left = position === 'left'
  const out = [left ? { k: 'ch', x: 0, y: 0, w: 16, h: 200, r: 0, c: t.onSurfaceA(0.14) } : { k: 'ch', x: 0, y: 0, w: 320, h: 16, r: 0, c: t.onSurfaceA(0.14) }]
  for (let i = 0; i < 4; i++) out.push(left ? bar('m' + i, 4, 86.5 + i * 8, 8, 3, strong) : bar('m' + i, 136.5 + i * 13, 6.5, 8, 3, strong))
  const x = left ? 24 : 8
  const y = left ? 85.75 : 16 + (184 - 28.5) / 2
  out.push(bar('rb', x, y, 30, 3, weak))
  for (let i = 0; i < 4; i++) out.push(poster('p' + i, x + i * 17, y + 9, 13, posterC))
  return out
}

export const homeRowsFallback = (modern, t) => {
  const weak = t.onSurfaceA(0.3)
  const posterC = t.onSurfaceA(0.16)
  const out = []
  // Two rows of a bar, 9 under it, the posters (with a 3 tall caption 3 under each modern one), 9 under the row.
  const rowH = 3 + 9 + (modern ? 39 + 3 + 3 : 27) + 9
  let y = 10 + (180 - 2 * rowH) / 2
  for (let row = 0; row < 2; row++) {
    out.push(bar('b' + row, 10, y, 44, 3, weak))
    y += 12
    for (let i = 0; i < (modern ? 4 : 6); i++) {
      if (modern) {
        out.push(poster('p' + row + i, 10 + i * 33, y, 26, posterC))
        out.push(bar('c' + row + i, 10 + i * 33, y + 42, 18, 3, weak))
      } else out.push(poster('p' + row + i, 10 + i * 23, y, 18, posterC))
    }
    y += (modern ? 45 : 27) + 9
  }
  return out
}
