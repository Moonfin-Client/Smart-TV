// Frost's tabs laid out as display lists in the glass window's own pixels, from what Details hands
// the page. Each tab gives back what never changes with focus (`list`), the pictures that grow when
// their tile is focused (`zoom`), and each focus key's box (`keys`), with `clipY` where a picture
// sits off center in its box. The scrolling tabs also say how tall they run (`h`).
import $L from '../../../services/i18n.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { cssShift, fontFor, themeSpacing } from '../../../ui/text.js'
import { formatDuration, getImageUrl } from '../../../utils/helpers.js'
import { castPhotoUrl } from '../detailsMedia.js'
import { spotlightItemImageUrl } from '../spotlight/spotlightImages.js'
import { ratingEntries } from '../modern/hero.js'
import { ratingValues } from '../modern/meta.js'
import { resumeLine } from '../stage/stageRules.js'
import { emptyList } from '../stage/Draw.js'
import { FROST_COLUMNS } from './frostRules.js'

export const wa = (hex, a) => `${String(hex).slice(0, 7)}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`

const width = (str, size, weight, ls = 0) => textWidth(str, size, weight) + ls * String(str).length

// Text with no letter spacing of its own takes the theme's.
const T = (out, k, x, y, str, size, weight, color, extra) => {
  out.texts.push({ k, x: Math.round(x * 100) / 100, y: y + cssShift(size), text: str, size, font: fontFor(str, weight), color, lh: 0, ls: themeSpacing(), ...extra })
}

// Frost's colors, from the theme's own tokens.
export const frostColors = (th) => ({
  ink: (a) => wa(th.onBackground, a),
  ground: (a) => wa(th.background, a),
  surface: (a) => wa(th.surface, a),
  focusFill: (a) => wa(th.buttonFocused, a),
  progress: th.rangeProgress,
  accent: th.accent,
})

// The facts line: the meta pieces at 27px split by middle dots, the rating and codecs as outlined
// chips after them.
const metaLine = (out, v, x0, y0, maxW, c) => {
  const pieces = (v.meta || []).map((p) => (p.kind === 'text' && v.item.OfficialRating && p.text === v.item.OfficialRating ? { ...p, rating: true } : p))
  if (v.techSize) pieces.push({ kind: 'text', text: v.techSize })
  const items = []
  const pillW = (pill) => 32 + width(pill.text, 19, 'bold')
  pieces.forEach((p, i) => {
    const lead = i ? 12 + width('·', 27, 'medium') + 12 : 0
    if (p.kind === 'seerr') {
      // Seerr's pills, 47px tall, so the line grows to hold them and the rest centers on it.
      if (p.pills && p.pills.length) items.push({ p, lead, w: p.pills.reduce((sum, pill, j) => sum + (j ? 12 : 0) + pillW(pill), 0), row: true })
      return
    }
    const chip = p.rating || p.kind === 'status' || p.kind === 'upcoming'
    const w = chip ? (p.rating ? 1.5 * 2 + 18 + width(p.text, 18, 'bold', 0.9) : 18 + (p.kind === 'upcoming' ? 24 : 0) + width(p.text, 18, 'bold')) : width(p.text, 27, 'medium')
    items.push({ p, lead, w, row: true })
  })
  const firstH = items.some((it) => it.p.kind === 'seerr') ? 47 : 33
  let x = x0
  let y = y0 + (firstH - 33) / 2
  items.forEach((it, i) => {
    if (it.lead) T(out, `md${i}`, x + 12, y, '·', 27, 'medium', c.ink(0.78), { lh: 33 })
    x += it.lead
    const p = it.p
    if (p.kind === 'seerr') {
      let px = x
      p.pills.forEach((pill, j) => {
        const pw = pillW(pill)
        out.rects.push({ k: `mp${i}-${j}`, x: px, y: y0, w: pw, h: 47, r: 9, color: pill.fill, bw: 1, bc: pill.border })
        T(out, `mpt${i}-${j}`, px + 16, y0 + 7, pill.text, 19, 'bold', pill.ink, { lh: 33 })
        px += pw + 12
      })
    } else if (p.rating) {
      out.rects.push({ k: `mr${i}`, x, y, w: it.w, h: 33, r: 7.5, color: '#00000001', bw: 1.5, bc: c.ink(0.55) })
      T(out, `mt${i}`, x + 10.5, y, p.text, 18, 'bold', c.ink(0.85), { lh: 33, ls: 0.9 })
    } else if (p.kind === 'status' || p.kind === 'upcoming') {
      out.rects.push({ k: `mr${i}`, x, y: y + 1.5, w: it.w, h: 30, r: 7.5, color: p.kind === 'upcoming' ? c.accent : p.ended ? '#b71c1cff' : '#2e7d32ff' })
      let tx = x + 9
      if (p.kind === 'upcoming') {
        out.imgs.push({ k: `mi${i}`, x: tx, y: y + 7.5, w: 18, h: 18, src: 'icons/d/calendar.webp' })
        tx += 24
      }
      T(out, `mt${i}`, tx, y + 1.5, p.text, 18, 'bold', '#ffffffff', { lh: 30 })
    } else T(out, `mt${i}`, x, y, p.text, 27, 'medium', c.ink(0.78), { lh: 33 })
    x += it.w
  })
  // The codec chips follow on the same line while they fit, then wrap.
  let lines = 1
  ;(v.techChips || []).forEach((label, i) => {
    const w = 1.5 * 2 + 18 + width(label, 18, 'bold', 0.9)
    const gap = i === 0 ? (items.length ? 21 : 0) : 9
    if (x + gap + w > x0 + maxW && x > x0) {
      x = x0
      y += lines === 1 ? 33 + (firstH - 33) / 2 : 33
      lines++
    } else x += gap
    out.rects.push({ k: `tc${i}`, x, y, w, h: 33, r: 7.5, color: '#00000001', bw: 1.5, bc: c.ink(0.55) })
    T(out, `tt${i}`, x + 10.5, y, label, 18, 'bold', c.ink(0.85), { lh: 33, ls: 0.9 })
    x += w
  })
  return firstH + (lines - 1) * 33
}

// The ratings strip: up to seven sources, a column each, the name over the score.
const strip = (out, v, x0, y0, w, c) => {
  const entries = ratingEntries(ratingValues(v.item, v.settings, v.mdbRatings || [])).slice(0, 7)
  if (!entries.length) return 0
  out.rects.push({ k: 'stripTop', x: x0, y: y0, w, h: 1.5, color: c.ink(0.14) })
  out.rects.push({ k: 'stripBottom', x: x0, y: y0 + 148.5, w, h: 1.5, color: c.ink(0.14) })
  const cw = w / entries.length
  entries.forEach((e, i) => {
    const cx = x0 + i * cw
    if (i) out.rects.push({ k: `sd${i}`, x: cx, y: y0 + 1.5, w: 1.5, h: 147, color: c.ink(0.14) })
    const name = String(e.name).toUpperCase()
    const nw = Math.min(cw - 12, width(name, 18, 'bold', 0.9))
    T(out, `sn${i}`, cx + (cw - nw) / 2, y0 + 1.5 + (147 - 76.8) / 2, name, 18, 'bold', c.ink(0.62), { lh: 22.5, ls: 0.9, maxw: cw - 12 + 2, maxlines: 1 })
    const vw = width(e.value, 42, 'bold', -0.75)
    T(out, `sv${i}`, cx + (cw - vw) / 2, y0 + 1.5 + (147 - 76.8) / 2 + 28.5, e.value, 42, 'bold', c.ink(0.94), { lh: 48.3, ls: -0.75 })
  })
  return 150
}

// The overview tab, laid out up from the window's foot.
export const overviewTab = (v, ww, wh, c, { tracks, credits, resume, status, watch }) => {
  const out = emptyList()
  const x0 = 84
  const cw = ww - 168
  const parts = []
  const title = wrapLines(v.item.Name || '', 96, 'bold', cw).slice(0, 2)
  parts.push({ gap: 0, h: title.length * 105, draw: (y) => title.forEach((ln, i) => T(out, `t${i}`, x0, y + i * 105, ln, 96, 'bold', c.ink(1), { lh: 105, ls: -2.4 })) })
  const probe = emptyList()
  const metaH = metaLine(probe, v, x0, 0, cw, c)
  parts.push({ gap: 18, h: metaH, draw: (y) => metaLine(out, v, x0, y, cw, c) })
  if (v.incomplete) {
    parts.push({ gap: 8, h: 33, draw: (y) => T(out, 'inc', x0, y, v.incomplete, 20, 'bold', '#e0a33cff', { lh: 33, maxw: cw, maxlines: 1 }) })
  }
  // A title only in Seerr: where it stands, with a bar while it downloads and the arr's reason under it.
  if (status) {
    const reason = status.reason ? wrapLines(status.reason, 21, 'regular', cw).slice(0, 3) : []
    parts.push({
      gap: 21, h: 33 + (reason.length ? 6 + reason.length * 26.25 : 0),
      draw: (y) => {
        let sx = x0
        out.rects.push({ k: 'sdot', x: sx, y: y + 9, w: 15, h: 15, r: 7.5, color: status.color })
        sx += 15 + 18
        if (status.fraction != null) {
          out.rects.push({ k: 'sbt', x: sx, y: y + 12.75, w: 165, h: 7.5, r: 4.5, color: '#ffffff40' })
          out.rects.push({ k: 'sbf', x: sx, y: y + 12.75, w: 165 * status.fraction, h: 7.5, r: 4.5, color: status.color })
          sx += 165 + 18
        }
        T(out, 'slab', sx, y, status.label, 24, 'medium', c.ink(0.8), { lh: 33, maxw: x0 + cw - sx, maxlines: 1 })
        reason.forEach((ln, i) => T(out, `sr${i}`, x0, y + 33 + 6 + i * 26.25, ln, 21, 'regular', c.ink(0.6), { lh: 26.25 }))
      },
    })
  }
  if (resume) {
    parts.push({
      gap: 21, h: 33,
      draw: (y) => {
        out.rects.push({ k: 'rt', x: x0, y: y + 12.75, w: 165, h: 7.5, r: 4.5, color: '#ffffff40' })
        out.rects.push({ k: 'rf', x: x0, y: y + 12.75, w: (165 * resume.percent) / 100, h: 7.5, r: 4.5, color: c.progress })
        T(out, 'rl', x0 + 165 + 18, y, resume.label, 24, 'medium', c.ink(0.8), { lh: 33 })
      },
    })
  }
  const stripH = strip(emptyList(), v, 0, 0, cw, c)
  if (stripH) parts.push({ gap: 21, h: 150, draw: (y) => strip(out, v, x0, y, cw, c) })
  const overview = v.hideDescription ? '' : v.overviewText
  const body = overview ? wrapLines(overview, 27, 'regular', 960) : []
  // The last line shown keeps where it wrapped and takes an ellipsis after it, and its maxLines cuts
  // characters only when the ellipsis doesn't fit.
  const shown = body.slice(0, 3)
  if (body.length > 3) shown[2] = `${shown[2]}…`
  const textH = shown.length ? 30 + shown.length * 39 : 0
  const creditsH = credits.length ? 42 : 0
  const sideH = tracks.length ? 3 + tracks.length * 60 + (tracks.length - 1) * 9 : watch ? 3 + 36 + 114 : 0
  const lowerH = Math.max(textH + creditsH, sideH)
  const text = { show: false, x: 66, y: 0, w: 996, h: textH, lines: [] }
  const trackBoxes = []
  if (lowerH) {
    parts.push({
      gap: 21, h: lowerH,
      draw: (y) => {
        if (shown.length) {
          text.show = true
          text.y = y
          text.lines = shown.map((ln, i) => ({ k: `ob${i}`, x: 18, y: 15 + i * 39 + cssShift(27), text: ln, font: fontFor(ln, 'regular'), maxw: i === 2 && body.length > 3 ? 960 : 0 }))
        }
        // The credits are one line cut with an ellipsis where it runs out, so whatever follows the
        // cut isn't drawn.
        if (credits.length) {
          const end = 66 + 18 + 960
          let cx = 66 + 18
          const cy = y + textH + 9
          const piece = (k, str, weight, color) => {
            const w = width(str, 24, weight)
            if (cx >= end) return false
            T(out, k, cx, cy, str, 24, weight, color, cx + w <= end ? { lh: 33 } : { lh: 33, maxw: end - cx, maxlines: 1 })
            cx += w
            return cx <= end
          }
          credits.every((cr, i) => {
            if (i) cx += 27
            if (!piece(`cl${i}`, cr.label, 'bold', c.ink(0.62))) return false
            cx += 10.5
            return piece(`cn${i}`, cr.names, 'regular', c.ink(0.92))
          })
        }
        tracks.forEach((t, i) => trackBoxes.push({ ...t, i, k: `overview:track:${i}`, x: ww - 84 - 534, y: y + 3 + i * 69, w: 534, h: 60 }))
        if (watch && !tracks.length) {
          const sx = ww - 84 - 534
          T(out, 'wh', sx + 24, y + 3, $L('Streaming on').toUpperCase(), 19.5, 'bold', c.ink(0.62), { lh: 24, ls: 0.9 })
          const cy = y + 3 + 36
          out.rects.push({ k: 'wc', x: sx, y: cy, w: 534, h: 114, r: 33, color: c.ink(0.1) })
          out.rects.push({ k: 'wlb', x: sx + 18, y: cy + 18, w: 78, h: 78, r: 19.5, color: c.ink(0.12) })
          if (watch.logo) out.imgs.push({ k: 'wl', x: sx + 18, y: cy + 18, w: 78, h: 78, r: 19.5, src: watch.logo })
          const tx = sx + 18 + 78 + 21
          const tw = 534 - 24 - (tx - sx)
          const blockH = 34.5 + (watch.others ? 28.5 : 0)
          const ty = cy + 18 + (78 - blockH) / 2
          T(out, 'wn', tx, ty, watch.name, 27, 'bold', c.ink(1), { lh: 34.5, maxw: tw, maxlines: 1 })
          if (watch.others) T(out, 'wo', tx, ty + 34.5, watch.others, 22.5, 'regular', c.ink(0.68), { lh: 28.5, maxw: tw, maxlines: 1 })
        }
      },
    })
  }
  const total = parts.reduce((sum, p, i) => sum + (i ? p.gap : 0) + p.h, 0)
  let y = wh - 75 - total
  parts.forEach((p, i) => {
    if (i) y += p.gap
    p.draw(y)
    y += p.h
  })
  return { list: out, text, tracks: trackBoxes }
}

// A grid's tiles, `columns` to a row, with each tile's focus box and its growing picture.
const gridOf = (name, list, areaW, spec, tile) => {
  const columns = FROST_COLUMNS[name]
  const out = emptyList()
  const zoom = []
  const keys = {}
  const tw = spec.tileW(areaW)
  let y = 6
  for (let first = 0; first < list.length; first += columns) {
    let rowH = 0
    list.slice(first, first + columns).forEach((entry, offset) => {
      const i = first + offset
      const x = offset * (tw + spec.gap)
      const h = tile(out, zoom, entry, i, x, y, tw)
      keys[`${name}:${i}`] = { x, y, w: tw, h, r: spec.radius }
      rowH = Math.max(rowH, h)
    })
    y += rowH + spec.rowGap
  }
  return { list: out, zoom, keys, h: y - spec.rowGap + 6 }
}

export const episodesTab = (episodes, areaW, server, c) => {
  const out = emptyList()
  const zoom = []
  const keys = {}
  let y = 6
  episodes.forEach((ep, i) => {
    const tag = ep.ImageTags && ep.ImageTags.Primary
    keys[`episodes:${i}`] = { x: 0, y, w: areaW, h: 180, r: 42 }
    out.rects.push({ k: `sb${i}`, x: 9, y: y + 9, w: 288, h: 162, r: 33, color: c.surface(1) })
    if (tag) zoom.push({ k: `si${i}`, fk: `episodes:${i}`, x: 9, y: y + 9, w: 288, h: 162, r: 33, src: getImageUrl(server, ep.Id, 'Primary', { maxWidth: 400, quality: 90, tag }), zoom: 1.05 })
    const textX = 330
    const textW = areaW - textX - 33 - 210
    const caps = ep.IndexNumber != null ? $L('Episode {number}').replace('{number}', ep.IndexNumber).toUpperCase() : ''
    const wrapped = ep.Overview ? wrapLines(ep.Overview, 22.5, 'regular', textW) : []
    const overview = wrapped.slice(0, 2)
    if (wrapped.length > 2) overview[1] = `${overview[1]}…`
    const blockH = (caps ? 24 + 4.5 : 0) + 39 + (overview.length ? 4.5 + overview.length * 30 : 0)
    let ty = y + 9 + (162 - blockH) / 2
    if (caps) {
      T(out, `ec${i}`, textX, ty, caps, 19.5, 'bold', c.ink(0.62), { lh: 24, ls: 0.9 })
      ty += 24 + 4.5
    }
    T(out, `en${i}`, textX, ty, ep.Name || '', 30, 'bold', c.ink(1), { lh: 39, maxw: textW, maxlines: 1 })
    ty += 39 + 4.5
    overview.forEach((ln, j) => T(out, `eo${i}-${j}`, textX, ty + j * 30, ln, 22.5, 'regular', c.ink(0.65), j === 1 && wrapped.length > 2 ? { lh: 30, maxw: textW, maxlines: 1 } : { lh: 30 }))
    // The runtime, the played tick and how far in, right-aligned in their own column.
    const sideR = areaW - 33
    const runtime = ep.RunTimeTicks ? formatDuration(ep.RunTimeTicks) : ''
    const progress = resumeLine(ep)
    const sideH = 30 + (progress ? 12 + 7.5 + 12 + 27 : 0)
    let sy = y + 9 + (162 - sideH) / 2
    const rw = runtime ? width(runtime, 22.5, 'medium') : 0
    if (runtime) T(out, `er${i}`, sideR - rw, sy, runtime, 22.5, 'medium', c.ink(0.72), { lh: 30 })
    if (ep.UserData && ep.UserData.Played) out.imgs.push({ k: `ep${i}`, x: sideR - rw - (runtime ? 10.5 : 0) - 25.5, y: sy + 2.25, w: 25.5, h: 25.5, src: 'icons/d/core_check_circle.webp', color: c.ink(0.62) })
    sy += 30
    if (progress) {
      out.rects.push({ k: `ebt${i}`, x: sideR - 150, y: sy + 12, w: 150, h: 7.5, r: 4.5, color: '#ffffff40' })
      out.rects.push({ k: `ebf${i}`, x: sideR - 150, y: sy + 12, w: (150 * progress.percent) / 100, h: 7.5, r: 4.5, color: c.progress })
      const lw = width(progress.label, 21, 'medium')
      T(out, `el${i}`, sideR - lw, sy + 31.5, progress.label, 21, 'medium', c.ink(0.72), { lh: 27 })
    }
    // The rows sit flush, with no gap between them.
    y += 180
  })
  return { list: out, zoom, keys, h: y + 6 }
}

// A show only in Seerr: each season with its poster, its numbers and where it stands.
export const seasonsTab = (seasons, areaW, c, statusOf, posterOf) => {
  const out = emptyList()
  const zoom = []
  const keys = {}
  let y = 6
  seasons.forEach((season, i) => {
    keys[`seasons:${i}`] = { x: 0, y, w: areaW, h: 180, r: 42 }
    out.rects.push({ k: `sp${i}`, x: 9, y: y + 9, w: 108, h: 162, r: 24, color: c.surface(1) })
    const poster = posterOf(season)
    if (poster) zoom.push({ k: `spi${i}`, fk: `seasons:${i}`, x: 9, y: y + 9, w: 108, h: 162, r: 24, src: poster, zoom: 1.05 })
    const status = statusOf(season)
    const pillW = 24 + 15 + 13.5 + width(status.label, 24, 'bold') + 24
    const pillX = areaW - 39 - pillW
    out.rects.push({ k: `spb${i}`, x: pillX, y: y + (180 - 51) / 2, w: pillW, h: 51, r: 25.5, color: c.ink(0.08) })
    out.rects.push({ k: `spd${i}`, x: pillX + 24, y: y + (180 - 15) / 2, w: 15, h: 15, r: 7.5, color: status.color })
    T(out, `spl${i}`, pillX + 24 + 15 + 13.5, y + (180 - 33) / 2, status.label, 24, 'bold', c.ink(1), { lh: 33 })
    const textX = 9 + 108 + 33
    const textW = pillX - 24 - textX
    const number = $L('Season {number}').replace('{number}', season.seasonNumber)
    const year = season.airDate ? String(season.airDate).slice(0, 4) : ''
    const caps = [number, year].filter(Boolean).join(' · ').toUpperCase()
    const count = season.episodeCount > 0 ? $L('{count} episodes').replace('{count}', season.episodeCount) : ''
    const blockH = 24 + 4.5 + 42 + (count ? 4.5 + 30 : 0)
    let ty = y + 9 + (162 - blockH) / 2
    T(out, `sc${i}`, textX, ty, caps, 19.5, 'bold', c.ink(0.62), { lh: 24, ls: 0.9, maxw: textW, maxlines: 1 })
    ty += 24 + 4.5
    T(out, `sn${i}`, textX, ty, season.name || number, 33, 'bold', c.ink(1), { lh: 42, maxw: textW, maxlines: 1 })
    ty += 42 + 4.5
    if (count) T(out, `so${i}`, textX, ty, count, 22.5, 'regular', c.ink(0.65), { lh: 30, maxw: textW, maxlines: 1 })
    y += 180
  })
  return { list: out, zoom, keys, h: y + 6 }
}

export const castTab = (cast, areaW, server, c) => gridOf('cast', cast, areaW, { tileW: (w) => w / 5, gap: 0, rowGap: 12, radius: 45 }, (out, zoom, person, i, x, y, tw) => {
  const ax = x + (tw - 174) / 2
  out.rects.push({ k: `cb${i}`, x: ax, y: y + 21, w: 174, h: 174, r: 87, color: c.surface(1) })
  const photo = castPhotoUrl(person, server, 240)
  if (photo) zoom.push({ k: `ci${i}`, fk: `cast:${i}`, x: ax, y: y + 21, w: 174, h: 174, r: 87, src: photo, zoom: 1.06, clipY: 0.2 })
  else out.imgs.push({ k: `cp${i}`, x: ax + 57, y: y + 21 + 57, w: 60, h: 60, src: 'icons/d/core_person.webp', color: c.ink(0.62) })
  const name = person.Name || ''
  const nw = Math.min(tw - 24, width(name, 27, 'bold'))
  T(out, `cn${i}`, x + (tw - nw) / 2, y + 21 + 174 + 18, name, 27, 'bold', c.ink(1), { lh: 34.5, maxw: tw - 24 + 2, maxlines: 1 })
  const role = person.Role ? String(person.Role).split('\n').filter(Boolean).join(', ') : ''
  if (role) {
    const rw = Math.min(tw - 24, width(role, 22.5, 'regular'))
    T(out, `cr${i}`, x + (tw - rw) / 2, y + 21 + 174 + 18 + 34.5, role, 22.5, 'regular', c.ink(0.65), { lh: 28.5, maxw: tw - 24 + 2, maxlines: 1 })
  }
  return 306
})

export const extrasTab = (extras, areaW, server, c) => gridOf('extras', extras, areaW, { tileW: (w) => (w - 30) / 3, gap: 15, rowGap: 15, radius: 45 }, (out, zoom, extra, i, x, y, tw) => {
  out.rects.push({ k: `xb${i}`, x: x + 15, y: y + 15, w: tw - 30, h: 288, r: 30, color: c.surface(1) })
  const url = spotlightItemImageUrl(server, extra)
  if (url) zoom.push({ k: `xi${i}`, fk: `extras:${i}`, x: x + 15, y: y + 15, w: tw - 30, h: 288, r: 30, src: url, zoom: 1.04 })
  T(out, `xn${i}`, x + 21, y + 15 + 288 + 21, extra.Name || '', 27, 'bold', c.ink(1), { lh: 34.5, maxw: tw - 42, maxlines: 1 })
  return 15 + 288 + 21 + 34.5 + 24
})

// The poster tiles sit flush, so a row ends 54px short. A Seerr title's dot (or its banner across
// the top) sits in the poster's thumb and grows with it on focus, so it rides on the zoomed picture:
// `marksOf(entry, w)` gives {dot, banner} for a poster `w` wide, or null.
export const postersTab = (name, posters, areaW, server, c, statusOf, marksOf) => gridOf(name, posters, areaW, { tileW: (w) => (w - 54) / 7, gap: 0, rowGap: 9, radius: 36 }, (out, zoom, entry, i, x, y, tw) => {
  const th = (tw - 24) * 1.5
  out.rects.push({ k: `pb${i}`, x: x + 12, y: y + 12, w: tw - 24, h: th, r: 24, color: c.surface(1) })
  const url = spotlightItemImageUrl(server, entry)
  const marks = marksOf ? marksOf(entry, tw - 24) : null
  if (url || marks) {
    zoom.push({ k: `pi${i}`, fk: `${name}:${i}`, x: x + 12, y: y + 12, w: tw - 24, h: th, r: 24, src: url || '', zoom: 1.05, dot: marks && marks.dot, banner: marks && marks.banner })
  }
  T(out, `pt${i}`, x + 15, y + 12 + th + 15, entry.Name || '', 22.5, 'bold', c.ink(0.9), { lh: 28.5, maxw: tw - 30, maxlines: 1 })
  const status = statusOf ? statusOf(entry) : null
  if (status) T(out, `ps${i}`, x + 15, y + 12 + th + 15 + 28.5 + 3, status.label, 19.5, 'medium', status.color, { lh: 25.5, maxw: tw - 30, maxlines: 1 })
  return 12 + th + 15 + 28.5 + (status ? 3 + 25.5 : 0) + 18
})

// The facts as cards, the first group in one column and the rest in the other.
export const groupsTab = (groups, ww, c) => {
  const out = emptyList()
  const x0 = 84
  const colW = (ww - 168 - 42) / 2
  const cards = []
  const column = (list, cx) => {
    let y = 168
    list.forEach((g, gi) => {
      if (gi) y += 24
      if (g.title) {
        const t = String(g.title).toUpperCase()
        T(out, `gt${cx}-${gi}`, cx + 27, y, t, 19.5, 'bold', c.ink(0.62), { lh: 24, ls: 0.9 })
        y += 24 + 10.5
      }
      const top = y
      g.rows.forEach(([label, value, logo], ri) => {
        let lx = cx + 27
        // The hairline between rows is a border on top of the next one, so it adds to its height.
        if (ri) {
          out.rects.push({ k: `gs${cx}-${gi}-${ri}`, x: cx + 27, y, w: colW - 27, h: 1.5, color: c.ink(0.08) })
          y += 1.5
        }
        const labelW = width(label, 24, 'regular')
        const valueW = colW - 27 - 27 - (logo ? 69 : 0) - labelW - 24
        const lines = value ? wrapLines(String(value), 24, 'regular', valueW).slice(0, 2) : []
        const rh = 27 + Math.max(logo ? 45 : 33, lines.length * 33)
        if (logo) {
          out.imgs.push({ k: `gl${cx}-${gi}-${ri}`, x: lx, y: y + (rh - 45) / 2, w: 45, h: 45, src: logo, r: 12 })
          lx += 69
        }
        T(out, `gk${cx}-${gi}-${ri}`, lx, y + (rh - 33) / 2, label, 24, 'regular', c.ink(0.62), { lh: 33 })
        lines.forEach((ln, li) => {
          const w = width(ln, 24, 'regular')
          T(out, `gv${cx}-${gi}-${ri}-${li}`, cx + colW - 27 - Math.min(w, valueW), y + 13.5 + li * 33, ln, 24, 'regular', c.ink(0.94), { lh: 33, maxw: valueW + 2, maxlines: 1 })
        })
        y += rh
      })
      cards.push({ k: `card${cx}-${gi}`, x: cx, y: top, w: colW, h: y - top })
    })
  }
  column(groups.slice(0, 1), x0)
  column(groups.slice(1), x0 + colW + 42)
  return { list: out, cards }
}
