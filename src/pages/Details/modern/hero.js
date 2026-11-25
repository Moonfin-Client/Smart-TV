// Modern's hero, laid out as plain lists of boxes, images and text lines the page draws, at
// 1920x1080. A piece that waits on something, like the logo's size, is laid out again when it lands.
import $L from '../../../services/i18n.js'
import { cssShift, fontFor } from '../../../ui/text.js'
import { textWidth, wrapLines } from '../../../ui/components/details/measure.js'
import { LOGO_WIDTHS } from '../../../ui/components/details/ratingLogos.js'
import { drawAnimePills } from '../detailMarks.js'

export const PAD_TOP = 135
export const PAD_RIGHT = 58
export const PAD_BOTTOM = 58
export const SCREEN_W = 1920

// Where the page starts beside the nav: the classic sidebar's rail, Reel and Mosaic's control, or
// nothing when the bar runs along the top.
export const contentLeft = (sideRoom) => (sideRoom === 'rail' ? 174 : sideRoom === 'control' ? 120 : 58)

const DOT = '·'

// The hero column's width: a share of the screen, clamped, narrower beside a Next Up card.
export const heroWidth = (hasUpNext) => (hasUpNext ? Math.min(986, Math.max(522, SCREEN_W * 0.5)) : Math.min(1595, Math.max(652, SCREEN_W * 0.85)))

const list = () => ({ rects: [], imgs: [], texts: [] })
const NO_BORDER = { w: 0, color: '#00000000' }

// Every box and image carries the same fields, so no binding ever reads one that isn't there.
const finish = (out) => {
  out.rects = out.rects.map((r) => ({ r: 0, bw: 0, bc: NO_BORDER.color, ...r }))
  out.imgs = out.imgs.map((im) => ({ r: 0, fit: 'cover', ...im }))
  return out
}

const RATING_SHADOW = { color: '#0000008a', x: 0, y: 0, blur: 6 }
const LOGO_SHADOW = [[0, 1, '#00000059'], [-2, 1, '#00000026'], [2, 1, '#00000026'], [0, -1, '#00000026'], [0, 3, '#00000026']]
const text = (out, k, x, y, str, size, weight, color, extra) => {
  out.texts.push({ k, x: Math.round(x * 100) / 100, y: y + cssShift(size), text: str, size, font: fontFor(str, weight), color, lh: 0, maxw: 0, maxlines: 0, ls: 0, rich: false, shadow: null, ...extra })
}

// The facts line: each piece after the first behind a dot, a runtime led by a clock, a status or
// upcoming date as a colored pill, Seerr's pills set apart without a dot.
const metaRow = (out, pieces, x0, y0, maxW, t) => {
  const color = t.os(0.75)
  const dotW = 12 + textWidth(DOT, 20) + 12
  const items = pieces.map((p, i) => {
    const lead = i > 0 && p.kind !== 'seerr' ? dotW : 0
    let w
    let h = 33
    if (p.kind === 'runtime') w = 26 + textWidth(p.text, 20)
    else if (p.kind === 'status') {
      w = 24 + textWidth(p.text, 16, 'bold')
      h = 39
    } else if (p.kind === 'upcoming') {
      w = 24 + 24 + textWidth(p.text, 16, 'bold')
      h = 39
    } else if (p.kind === 'seerr') {
      w = p.pills.reduce((sum, pill, j) => sum + (j ? 12 : 0) + 32 + textWidth(pill.text, 19, 'bold'), 0) + (i > 0 ? 12 : 0)
      h = 47
    } else w = textWidth(p.text, 20)
    return { p, lead, w, h }
  })
  // Wrap into lines the way flex-wrap does, then center each item in its line's height.
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
        text(out, `${k}d`, ix + 12, y + (lh - 33) / 2, DOT, 20, 'regular', color, { lh: 33 })
        ix += it.lead
      }
      const p = it.p
      if (p.kind === 'runtime') {
        out.imgs.push({ k: `${k}i`, x: ix, y: iy + 6.5, w: 20, h: 20, src: 'icons/d/schedule.webp', color })
        text(out, k, ix + 26, iy, p.text, 20, 'regular', color, { lh: 33 })
      } else if (p.kind === 'status' || p.kind === 'upcoming') {
        out.rects.push({ k: `${k}r`, x: ix, y: iy, w: it.w, h: 39, r: 12, color: p.kind === 'upcoming' ? '#00a4dcff' : p.ended ? '#b71c1cff' : '#2e7d32ff' })
        let tx = ix + 12
        if (p.kind === 'upcoming') {
          out.imgs.push({ k: `${k}i`, x: tx, y: iy + 10.5, w: 18, h: 18, src: 'icons/d/calendar.webp', color: '#ffffffff' })
          tx += 24
        }
        text(out, k, tx, iy + 3, p.text, 16, 'bold', '#ffffffff', { lh: 33 })
      } else if (p.kind === 'seerr') {
        let px = ix + (it.x > 0 ? 12 : 0)
        p.pills.forEach((pill, j) => {
          const pw = 32 + textWidth(pill.text, 19, 'bold')
          out.rects.push({ k: `${k}p${j}`, x: px, y: iy, w: pw, h: 47, r: 9, color: pill.fill, bw: 1, bc: pill.border })
          text(out, `${k}t${j}`, px + 16, iy + 7, pill.text, 19, 'bold', pill.ink, { lh: 33 })
          px += pw + 12
        })
      } else {
        text(out, k, ix, iy, p.text, 20, 'regular', color, { lh: 33 })
      }
    })
    y += lh + 9
  })
  return lines.length ? y - 9 - y0 : 0
}

// The file size and the codec chips.
const techRow = (out, size, chips, x0, y0, maxW, t) => {
  const items = []
  if (size) items.push({ kind: 'size', text: size, w: textWidth(size, 20, 'bold') + (chips.length ? 24 + textWidth(DOT, 20) : 0), h: 33 })
  chips.forEach((label) => items.push({ kind: 'chip', text: label, w: 26 + textWidth(label, 16, 'medium'), h: 43 }))
  let x = 0
  let y = y0
  let line = []
  const flush = () => {
    const lh = Math.max(...line.map((it) => it.h))
    line.forEach((it, i) => {
      const iy = y + (lh - it.h) / 2
      const k = `t${y}-${i}`
      if (it.kind === 'size') {
        text(out, k, x0 + it.x, iy, it.text, 20, 'bold', t.os(0.75), { lh: 33 })
        if (chips.length) text(out, `${k}d`, x0 + it.x + textWidth(it.text, 20, 'bold') + 12, iy, DOT, 20, 'regular', '#ffffff80', { lh: 33 })
      } else {
        out.rects.push({ k: `${k}r`, x: x0 + it.x, y: iy, w: it.w, h: 43, r: 6, color: '#00000001', bw: 1, bc: '#ffffff4d' })
        text(out, k, x0 + it.x + 13, iy + 5, it.text, 16, 'medium', '#ffffffcc', { lh: 33 })
      }
    })
    y += lh + 9
    line = []
    x = 0
  }
  items.forEach((it) => {
    if (line.length && x + it.w > maxW) flush()
    line.push({ ...it, x })
    x += it.w + 12
  })
  if (line.length) flush()
  return items.length ? y - 9 - y0 : 0
}

// The ratings line: the viewer's score, the community stars, the server's critic
// score until the plugin answers, then the plugin's in the viewer's order. Each is its logo or star
// and score, with the source's name under it when labels are on, on a dark chip when badges are.
export const ratingEntries = ({ personal, community, critic, plugin }) => {
  const out = []
  if (personal) out.push({ key: 'personal', star: true, starColor: 'accent', value: personal, name: $L('My Rating') })
  if (community) out.push({ key: 'community', star: true, starColor: '#ffc107ff', value: community, name: $L('Community') })
  if (critic != null) out.push({ key: 'critic', logo: critic >= 60 ? 'rt-fallback-fresh' : 'rt-fallback-rotten', value: `${critic}%`, name: $L('Rotten Tomatoes') })
  plugin.forEach((r) => {
    const file = (r.iconUrl || '').split('/').pop().replace('.svg', '').split('?')[0]
    out.push({ key: r.source, logo: LOGO_WIDTHS[file] ? file : '', value: r.formatted, name: r.name })
  })
  return out
}

// `center` centers each line in maxW, for Premiere.
export const ratingsRow = (out, entries, x0, y0, maxW, { labels, badges }, t, center = false) => {
  const items = entries.map((e) => {
    const lead = e.star ? 6 + textWidth('★', 28) : e.logo ? LOGO_WIDTHS[e.logo] + 7 : 0
    const topH = e.logo ? 32 : e.star ? 28 : 24
    const topW = lead + textWidth(e.value, 24, 'bold')
    const nameW = labels ? textWidth(e.name, 16, 'medium') : 0
    const pad = badges ? 12 : 0
    const h = topH + (labels ? 2 + 17.6 : 0) + (badges ? 12 : 0)
    return { e, lead, topH, w: Math.max(topW, nameW) + pad * 2, h, pad }
  })
  let x = 0
  let y = y0
  let line = []
  const flush = () => {
    const lh = Math.max(...line.map((it) => it.h))
    const shift = center ? (maxW - (x - 9)) / 2 : 0
    line.forEach((it) => {
      const ix = x0 + shift + it.x
      const iy = y + (lh - it.h) / 2
      const k = `r${it.e.key}`
      if (badges) out.rects.push({ k: `${k}b`, x: ix, y: iy, w: it.w, h: it.h, r: 6, color: t.scrimA(0.45) })
      const cx = ix + it.pad
      const cy = iy + (badges ? 6 : 0)
      if (it.e.star) {
        const starColor = it.e.starColor === 'accent' ? t.accent : it.e.starColor
        text(out, `${k}s`, cx, cy, '★', 28, 'regular', starColor, { lh: 28, font: 'roboto-web' })
      } else if (it.e.logo) {
        out.imgs.push({ k: `${k}i`, x: cx, y: cy, w: LOGO_WIDTHS[it.e.logo], h: 32, src: `icons/ratings/${it.e.logo}.webp`, color: '#ffffffff' })
      }
      text(out, `${k}v`, cx + it.lead, cy + (it.topH - 24) / 2, it.e.value, 24, 'bold', t.onSurface, { lh: 24, shadow: RATING_SHADOW })
      if (labels) {
        text(out, `${k}n`, cx, cy + it.topH + 2, it.e.name, 16, 'medium', t.onSurface, { lh: 17.6, shadow: RATING_SHADOW })
      }
    })
    y += lh + 6
    line = []
    x = 0
  }
  items.forEach((it) => {
    if (line.length && x + it.w > maxW) flush()
    line.push({ ...it, x })
    x += it.w + 9
  })
  if (line.length) flush()
  return items.length ? y - 6 - y0 : 0
}

// The overview box: plain copy when it fits four lines, otherwise a
// focusable box with Read More under it that opens in place to 319px and scrolls.
export const OVERVIEW_LH = 29
export const overviewBox = (prose, width) => {
  const plainLines = wrapLines(prose, 20, 'regular', width).length
  const canToggle = plainLines > 4
  const textW = canToggle ? width - 36 : width
  const lines = canToggle ? wrapLines(prose, 20, 'regular', textW).length : plainLines
  return { canToggle, textW, lines, width }
}

export const overviewHeight = (box, expanded) => {
  if (!box.canToggle) return box.lines * OVERVIEW_LH
  const collapsed = 36 + Math.min(4, box.lines) * OVERVIEW_LH + 12 + 33
  if (!expanded) return collapsed
  return Math.min(319, 36 + box.lines * OVERVIEW_LH + 12 + 33)
}

// The title block: a person's photo, the logo or name (an episode leads with its series), when a
// person was born, the facts line, the technical line and the ratings.
const titleBlock = (out, d, x0, y0, maxW, t) => {
  let y = y0
  const gap = () => (y > y0 ? 9 : 0)
  const at = () => y + gap()
  if (d.avatar) {
    const ay = at()
    out.imgs.push({ k: 'avatar', x: x0 + 4, y: ay + 4, w: 180, h: 180, src: d.avatar, r: 90, fit: 'cover', color: '#ffffffff' })
    out.rects.push({ k: 'avatarRing', x: x0, y: ay, w: 188, h: 188, r: 94, color: '#00000001', bw: 4, bc: '#ffffff33' })
    y = ay + 188
  }
  if (d.seriesLabel) {
    const sy = at()
    text(out, 'series', x0, sy, d.seriesLabel, 20, 'medium', '#ffffffb3', { lh: 33, ls: 1.74, maxw: maxW, maxlines: 1 })
    y = sy + 33
  }
  if (d.logo) {
    const ly = at()
    const boxH = d.logo.boxH || d.logo.h
    const lx = x0
    const lyy = ly + (boxH - d.logo.h) / 2
    // The logo's drop shadow, drawn as dark copies of the logo around it.
    LOGO_SHADOW.forEach(([dx, dy, a], i) => out.imgs.push({ k: `logoS${i}`, x: lx + dx, y: lyy + dy, w: d.logo.w, h: d.logo.h, src: d.logo.url, color: a, logo: true }))
    out.imgs.push({ k: 'logo', x: lx, y: lyy, w: d.logo.w, h: d.logo.h, src: d.logo.url, color: '#ffffffff', logo: true })
    y = ly + boxH
  }
  if (d.title) {
    const ty = at()
    const lines = wrapLines(d.title, 52, 'bold', maxW)
    lines.forEach((ln, i) => text(out, `title${i}`, x0, ty + i * 63.44, ln, 52, 'bold', '#ffffffff', { lh: 63.44 }))
    y = ty + lines.length * 63.44
  }
  if (d.born) {
    const by = at()
    text(out, 'born', x0, by, d.born, 20, 'regular', '#ffffffb3', { lh: 33 })
    y = by + 33
  }
  if (d.meta.length) {
    const my = at()
    y = my + metaRow(out, d.meta, x0, my, maxW, t)
  }
  // The Incomplete line sits 8px down in place of the column's gap.
  if (d.incomplete) {
    const iy = y + 8
    text(out, 'incomplete', x0, iy, d.incomplete, 20, 'bold', '#e0a33cff', { lh: 33 })
    y = iy + 33
  }
  if (d.anime && (d.anime.marker || d.anime.audio)) {
    const ay = at()
    const row = drawAnimePills(out, 'anime', d.anime.marker, d.anime.audio, x0, ay, 'large')
    if (row.h) y = ay + row.h
  }
  if (d.techSize || d.techChips.length) {
    const ty = at()
    y = ty + techRow(out, d.techSize, d.techChips, x0, ty, maxW, t)
  }
  if (d.ratings.length) {
    const ry = at()
    y = ry + ratingsRow(out, d.ratings, x0, ry, maxW, d.ratingStyle, t)
  }
  return y
}

// The whole hero. `d` carries what the page worked out about the item, and the result is the draw
// lists plus where the action row, the overview and the Next Up card go and where the hero ends.
export const layoutHero = (d, t) => {
  const out = list()
  const x0 = d.left
  const contentW = SCREEN_W - PAD_RIGHT - x0
  const heroW = heroWidth(d.hasUpNext)
  let y = PAD_TOP
  let heroTop = PAD_TOP
  const mainW = d.hasUpNext ? heroW : Math.min(heroW, contentW)
  if (d.hasUpNext) {
    // The title block spans the page above the hero row, so it isn't squeezed into half the screen.
    y = titleBlock(out, d, x0, PAD_TOP + 3, contentW, t)
    heroTop = y + 14
    y = heroTop
  } else {
    y = titleBlock(out, d, x0, PAD_TOP, mainW, t)
  }
  let overview = null
  if (!d.hideDescription) {
    if (d.tagline) {
      const ty = y + 20
      const lines = wrapLines(d.tagline, 20, 'medium', mainW)
      lines.forEach((ln, i) => {
        // Italic needs a canvas face. A theme's own face (Neon Pulse, 8-bit Hero) only has its atlas,
        // so it draws upright there.
        const face = fontFor(ln, 'medium')
        const font = /^roboto/.test(face) ? 'roboto-medium-web' : face
        out.texts.push({ k: `tag${i}`, x: x0, y: ty + i * 33 + cssShift(20), text: `[i]${ln.replace(/\[/g, '(')}[/i]`, rich: true, size: 20, font, color: '#ffffffe6', lh: 33, maxw: 0, maxlines: 0, ls: 0 })
      })
      y = ty + lines.length * 33
    }
    if (d.overview) {
      const box = overviewBox(d.overview, Math.min(1160, mainW))
      const oy = y + 12
      overview = { x: x0, y: oy, box }
      y = oy + overviewHeight(box, d.overviewExpanded)
    }
  }
  const actionsY = y + (d.hasTech ? 17 : 35)
  const actionsBottom = actionsY + 75
  let heroBottom = actionsBottom
  let upNext = null
  if (d.hasUpNext) {
    upNext = { x: SCREEN_W - PAD_RIGHT - 594, y: heroTop, w: 594 }
    heroBottom = Math.max(heroBottom, heroTop + d.upNextH)
  }
  return { ...finish(out), actionsY, mainW, heroBottom, upNext, overview, x0, contentW }
}
