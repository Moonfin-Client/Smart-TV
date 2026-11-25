// What an open Spotlight card draws, laid out in the panel's scroll box: 1526px wide, y from its top.
// Each section is a heading (a toggle when it folds) over its content, 24px apart, 8px after a
// folded one. Grids wrap 30px apart, the media grid from the left and the rest centered line by line.
import $L from '../../../services/i18n.js'
import { cssShift, fontFor } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { toCard } from '../../../ui/models.js'
import { formatDuration, getImageUrl } from '../../../utils/helpers.js'
import { formatPlaybackDuration } from '../../../utils/playbackTimeLabels.js'
import { buildMediaFacts } from '../../../utils/seerrMediaFacts.js'
import { reviewMeta, reviewPreview, reviewInitial } from '../../../utils/tmdbReviews.js'
import * as seerrApi from '../../../services/seerrApi.js'
import { castPhotoUrl } from '../detailsMedia.js'

export const BODY_W = 1526
// Cells sit 24px apart across a line, as on Home, and lines 30px apart.
const GAP_X = 24
const GAP = 30
const MEDIA = { portrait: { w: 240, h: 360 }, square: { w: 240, h: 240 }, landscape: { w: 384, h: 216 } }

const lines = (str, size, weight, w) => {
  let out = []
  String(str || '').split('\n').forEach((para) => {
    out = out.concat(wrapLines(para, size, weight, w))
  })
  return out
}

// Wraps cells into lines. Each line is as tall as its tallest cell, and a cell marked `stretch`
// grows to it.
const flow = (cells, top, centered, row0) => {
  let y = top
  let row = row0
  for (let start = 0; start < cells.length; row++) {
    let used = 0
    let n = 0
    while (start + n < cells.length && (n === 0 || used + GAP_X + cells[start + n].w <= BODY_W)) {
      used += (n ? GAP_X : 0) + cells[start + n].w
      n++
    }
    const line = cells.slice(start, start + n)
    const h = Math.max(...line.map((c) => c.h))
    let x = centered ? (BODY_W - used) / 2 : 0
    line.forEach((c) => {
      c.x = x
      c.y = y
      c.h = c.stretch ? h : c.h
      c.row = row
      x += c.w + GAP_X
    })
    y += h + GAP
    start += n
  }
  return { bottom: cells.length ? y - GAP : top, row }
}

// `card` is a built Spotlight card, `expanded` says which foldable sections are open, and `ctx`
// holds the server, the picks the file details need, and `ink` and `os`, the theme's onBackground
// and onSurface at an alpha, for the headings.
export const layoutModal = (card, expanded, ctx) => {
  const out = { rects: [], imgs: [], texts: [], cells: [], fileInfo: null, h: 0, first: -1 }
  const text = (k, x, y, str, size, weight, color, extra) => out.texts.push({
    k, x, y: y + cssShift(size), text: str, size, font: fontFor(str, weight), color, lh: 33, maxw: 0, maxlines: 1, align: 'left', ...extra,
  })
  const focusable = (c) => {
    c.i = out.cells.length
    out.cells.push(c)
    return c
  }
  let y = 0
  let row = 0
  let prevFolded = false
  const sections = (card && card.sections) || []
  const openFlags = sections.map((s, i) => !s.collapsible || (expanded[s.id || s.title || String(i)] != null ? expanded[s.id || s.title || String(i)] : s.expanded !== false))
  const firstOpen = openFlags.indexOf(true)

  sections.forEach((section, si) => {
    const key = section.id || section.title || String(si)
    const open = openFlags[si]
    if (si > 0) y += prevFolded ? 8 : 24
    prevFolded = section.collapsible && !open
    let headingTop = null
    if (section.title) {
      headingTop = y
      const k = `h${si}`
      const tx = section.collapsible ? 31 : 0
      const ty = section.collapsible ? y + 5 : y
      const titleW = textWidth(section.title, 24, 'bold')
      if (section.collapsible) {
        focusable({ kind: 'toggle', k: `toggle-${si}`, key, open, x: -10, y, w: BODY_W + 10, h: 47, row: row++, section: si, top: true })
        out.imgs.push({ k: `${k}c`, x: -1, y: y + 11.5, w: 24, h: 24, src: open ? 'icons/d/expandMore.webp' : 'icons/d/chevronRight.webp', color: '#ffffffb3' })
      }
      text(`${k}t`, tx, ty + 2, section.title, 24, 'bold', ctx.ink || '#ffffffff')
      if (section.count != null) {
        const label = String(section.count)
        const pw = 24 + textWidth(label, 18)
        out.rects.push({ k: `${k}p`, x: tx + titleW + 8, y: ty, w: pw, h: 37, r: 18.5, color: ctx.os ? ctx.os(0.08) : '#ffffff14' })
        text(`${k}n`, tx + titleW + 8 + 12, ty + 2, label, 18, 'regular', ctx.os ? ctx.os(0.7) : '#ffffffb3')
      }
      y += section.collapsible ? 47 : 37
      if (open) y += 20
    }
    if (!open) return
    const first = si === firstOpen
    const top = y
    const startCells = out.cells.length
    const kind = section.kind
    const sectionCells = []
    const add = (c) => sectionCells.push(c)

    if (kind === 'media' || kind === 'seerr') {
      const size = MEDIA[section.aspect] || MEDIA.portrait
      const type = section.aspect === 'landscape' ? 'landscape' : section.aspect === 'square' ? 'square' : 'poster'
      section.items.forEach((it, i) => {
        const model = toCard(it, type, i)
        if (!model.image && it._externalPosterUrl) model.image = it._externalPosterUrl
        const credit = kind === 'seerr' && section.showCredit && it._seerrCredit ? it._seerrCredit : ''
        // A Seerr card has no poster labels, so it carries its title alone.
        const labels = model.subtitle && kind !== 'seerr' ? 90 : 53
        add({
          kind: 'card', item: it, model, cardType: type === 'poster' ? 'portrait' : type, cardW: size.w, cardH: size.h, w: size.w, h: size.h + labels + (credit ? 6 + 33 : 0), credit,
          creditY: size.h + labels + 6, seerr: kind === 'seerr', current: section.currentId != null && it.Id === section.currentId,
          member: Boolean(section.collectionMembers), marker: it.Type === 'Season' && section.seasonStatus ? section.seasonStatus.get(it.IndexNumber) : null,
        })
      })
      row = flow(sectionCells, top, kind === 'seerr', row).row
    } else if (kind === 'people') {
      section.people.forEach((p, i) => {
        const name = lines(p.Name, 20, 'regular', 180)
        const role = p.Role ? lines(p.Role, 17, 'regular', 180) : []
        add({
          kind: 'person', item: p, w: 198, h: 1 + 8 + 160 + 10 + name.length * 33 + (role.length ? 10 + role.length * 33 : 0) + 8 + 1, stretch: true,
          photo: castPhotoUrl(p, ctx.serverUrl, 300) || '', name: p.Name || '', nameLines: name.length, role: p.Role || '', k: `p${i}`,
        })
      })
      row = flow(sectionCells, top, true, row).row
    } else if (kind === 'studios') {
      section.studios.forEach((s, i) => {
        const name = lines(s.name, 19, 'regular', 240)
        add({ kind: 'studio', name: s.name, nameLines: name.length, logo: s.logo || '', w: 266, h: 1 + 12 + 90 + 12 + name.length * 33 + 12 + 1, stretch: true, k: `s${i}` })
      })
      row = flow(sectionCells, top, true, row).row
    } else if (kind === 'chapters') {
      const it = section.item
      ;(it.Chapters || []).forEach((ch, i) => {
        const name = ch.Name || `${$L('Chapter')} ${i + 1}`
        const time = formatPlaybackDuration((ch.StartPositionTicks || 0) / 10000000)
        add({
          kind: 'chapter', name, time, timeW: 12 + textWidth(time, 16), ticks: ch.StartPositionTicks || 0, w: 314, h: 1 + 6 + 158 + 8 + 33 + 6 + 1, k: `ch${i}`,
          thumb: ch.ImageTag ? getImageUrl(ctx.serverUrl, it.Id, `Chapter/${i}`, { maxWidth: 400, quality: 90, tag: ch.ImageTag }) : '',
        })
      })
      row = flow(sectionCells, top, true, row).row
    } else if (kind === 'reviews') {
      section.reviews.forEach((r, i) => {
        const preview = reviewPreview(r.content)
        add({
          kind: 'review', review: r, w: 520, h: 250, k: `rv${i}`, author: r.author || '', meta: reviewMeta(r), initial: reviewInitial(r.author),
          avatar: r.avatarUrl || '', preview,
        })
      })
      row = flow(sectionCells, top, true, row).row
    } else if (kind === 'tracks') {
      if (section.loading) {
        out.spinner = { y: top, h: 160 }
      } else {
        let ty = top
        section.tracks.forEach((tr, i) => {
          const title = section.isPlaylist && tr.SeriesName ? `${tr.SeriesName} · ${tr.Name || ''}` : tr.Name || ''
          const runtime = tr.RunTimeTicks ? formatDuration(tr.RunTimeTicks) : ''
          add({
            kind: 'track', item: tr, list: section.tracks, opens: Boolean(section.opensItems), x: 0, y: ty, w: BODY_W, h: 88, row: row++, k: `t${i}`,
            index: String(section.isPlaylist ? i + 1 : tr.IndexNumber || i + 1), title, runtime,
          })
          ty += 88 + 4
        })
      }
    } else if (kind === 'fileInfo') {
      out.fileInfo = { y: top, item: section.item, mediaSource: section.mediaSource }
      sectionCells.push({ kind: 'fileInfo', x: 0, y: top, w: 1100, h: 0, row: row++, k: 'file' })
    } else if (kind === 'seerrChips') {
      const label = $L('Genres and Tags')
      add({ kind: 'chips', label, x: 16, y: top, w: 40 + textWidth(label, 14), h: 53, row: row++, k: 'chips' })
    } else if (kind === 'seerrFacts') {
      const facts = buildMediaFacts(ctx.seerr.details, ctx.seerr.mediaType)
      const x0 = (BODY_W - 1142) / 2
      let ly = top + 15
      for (let i = 0; i < facts.length; i += 3) {
        if (i) {
          ly += 10
          out.rects.push({ k: `rule${i}`, x: x0 + 21, y: ly, w: 1100, h: 1, color: '#ffffff1a' })
          ly += 11
        }
        facts.slice(i, i + 3).forEach((f, ci) => {
          const fx = x0 + 21 + ci * 378
          if (ci) out.rects.push({ k: `sep${i}-${ci}`, x: fx - 17, y: ly + 18, w: 1, h: 32, color: '#ffffff1a' })
          text(`fl${i}-${ci}`, fx, ly, f.label, 14, 'medium', '#ffffff99')
          text(`fv${i}-${ci}`, fx, ly + 36, f.value, 16, 'bold', '#ffffffff')
        })
        ly += 69
      }
      const h = ly + 15 - top
      out.rects.push({ k: `facts${si}`, x: x0, y: top, w: 1142, h, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f', under: true })
      add({ kind: 'facts', x: x0, y: top, w: 1142, h, row: row++, k: 'facts' })
    } else if (kind === 'seerrStreaming') {
      const x0 = (BODY_W - 1142) / 2
      text('streamLabel', x0 + 21, top + 15, $L('Streaming on'), 14, 'medium', '#ffffff99')
      let px = 21
      let py = top + 15 + 33 + 10
      let rowH = 0
      ;(ctx.seerr.streaming || []).forEach((p, i) => {
        if (px + 92 > 21 + 1100) {
          px = 21
          py += rowH + 10
          rowH = 0
        }
        out.imgs.push({ k: `sl${i}`, x: x0 + px + 14, y: py, w: 64, h: 64, src: seerrApi.getImageUrl(p.logoPath, 'w92'), r: 12, color: '#ffffffff' })
        const names = wrapLines(p.name || '', 14, 'bold', 92)
        names.forEach((n, j) => text(`sn${i}-${j}`, x0 + px, py + 70 + j * 16.8, n, 14, 'bold', '#ffffffff', { lh: 16.8, maxw: 92, align: 'center' }))
        rowH = Math.max(rowH, 70 + names.length * 16.8)
        px += 92 + 20
      })
      const h = py + rowH + 10 + 15 - top
      out.rects.push({ k: `stream${si}`, x: x0, y: top, w: 1142, h, r: 10, color: '#ffffff0f', bw: 1, bc: '#ffffff1f', under: true })
      sectionCells.push({ kind: 'static', x: x0, y: top, w: 1142, h, k: 'stream' })
    }

    sectionCells.forEach((c, ci) => {
      // Keys stay unique across sections, since two of them can list the same kind of cell.
      c.k = `${si}-${c.kind}-${ci}`
      c.section = si
      c.headingTop = headingTop
      c.gridTop = top
      if (c.kind !== 'static') focusable(c)
    })
    // The remote lands on the first section's first cell, where that section draws one.
    if (first && out.cells.length > startCells && ['media', 'seerr', 'people', 'studios', 'chapters', 'reviews', 'tracks', 'fileInfo'].indexOf(kind) >= 0) out.first = startCells
    const bottom = sectionCells.reduce((b, c) => Math.max(b, c.y + c.h), top)
    y = Math.max(bottom, out.spinner && kind === 'tracks' ? top + 160 : bottom)
  })
  out.h = y + 24
  out.rects = out.rects.map((r) => ({ r: 0, bw: 0, bc: '#00000000', ...r }))
  out.imgs = out.imgs.map((im) => ({ r: 0, ...im }))
  return out
}
