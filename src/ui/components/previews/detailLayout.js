// The detail style previews, laid out the way the browser flows them on the 960 by 540 design
// screen, as flat lists DetailPreview draws: boxes (fills, gradients, artwork, icons, in paint
// order), rings (borders, over the boxes), texts (on top), grads (the stand-ins' diagonal fill, under
// everything) and the ratings row's place. Every line box is 33px unless a style sets its own.
import $L from '../../../services/i18n.js'
import { fontFor, cssShift, textWidth } from '../../text.js'
import { serverBlurredUrl } from '../../../utils/serverBlur.js'
import { scrimSrc } from '../../../utils/scrimImage.js'
import { minimalistScrimAlpha } from '../../../pages/Details/minimalist/minimalistRules.js'
import { stageScrimAlpha } from '../../../pages/Details/stage/stageRules.js'
import { hex2 } from '../../themeColor.js'
import { itemAt } from './kit.js'
import { detailMeta, detailTech, detailWash, detailActions, MORE_ICON } from './detailRules.js'

const LH = 33
// The text shadow on Classic's title, overview, headings and poster titles.
const TEXT_SHADOW = { color: '#0000008a', x: 0, y: 0, blur: 4 }
const WEIGHT = { 400: 'regular', 500: 'medium', 600: 'bold', 700: 'bold', 800: 'bold' }
const ICON = {
  play: 'icons/d/play.webp',
  admin: 'icons/d/admin.webp',
  playArrow: 'icons/preview/play_arrow.webp',
  schedule: 'icons/preview/schedule.webp',
  arrowDown: 'icons/preview/keyboard_arrow_down.webp',
}

const rgba = (r, g, b, a = 1) => '#' + hex2(r) + hex2(g) + hex2(b) + hex2(a * 255)
const white = (a) => rgba(255, 255, 255, a)
const black = (a) => rgba(0, 0, 0, a)
const ofRgb = (c, a) => c.slice(0, 7) + hex2(a * 255)
const num = (c) => parseInt(c.slice(1, 9), 16) >>> 0
const tw = (str, size, weight = 400, ls = 0) => textWidth(str, size, WEIGHT[weight]) + ls * String(str || '').length

const newOut = () => ({ boxes: [], rings: [], texts: [], grads: [], ratings: null })

const box = (o, x, y, w, h, color, r = 0) => {
  o.boxes.push({ x, y, w, h, color, r, src: '', fit: null })
}
// Cover fit at [px, py] (0 to 1), or a stand-in fill without a url.
const art = (o, x, y, w, h, url, t, px = 0.5, py = 0.5, r = 0) => {
  if (!url) return box(o, x, y, w, h, t.onSurfaceA(0.1), r)
  o.boxes.push({ x, y, w, h, color: '#ffffffff', r, src: url, fit: { type: 'cover', position: { x: px, y: py } } })
}
const icon = (o, x, y, size, src, color) => {
  o.boxes.push({ x, y, w: size, h: size, color, r: 0, src, fit: null })
}
const ring = (o, x, y, w, h, bw, color, r = 0) => {
  o.rings.push({ x, y, w, h, r, border: { w: bw, color: num(color) } })
}
// [y] is the top of the CSS line box, [lh] its height. Text clamped to [lines] at [maxw] is broken
// here, where the widths are Chrome's, rather than by the renderer, whose glyphs run a little narrower.
const text = (o, x, y, str, size, weight, color, opt = {}) => {
  if (!str) return
  const content = opt.lines && opt.maxw ? wrap(str, size, weight, opt.maxw, opt.lines, opt.ls || 0).join('\n') : str
  o.texts.push({
    x, y: y + cssShift(size), text: content, size, font: fontFor(content, WEIGHT[weight]), color, lh: opt.lh || LH,
    maxw: 0, maxlines: 0, clip: false, ls: opt.ls || 0, shadow: opt.shadow || null,
  })
}
// A clamped paragraph left aligned at [w], returning its height.
const para = (o, x, y, str, size, weight, color, w, lines, lh) => {
  if (!str) return 0
  text(o, x, y, str, size, weight, color, { maxw: w, lines, lh })
  return wrap(str, size, weight, w, lines).length * lh
}
// The lines CSS breaks [str] into at [w], the last kept one ending in an ellipsis when cut.
const wrap = (str, size, weight, w, lines, ls = 0) => {
  const words = String(str || '').split(' ')
  const out = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    const next = line ? line + ' ' + words[i] : words[i]
    if (line && tw(next, size, weight, ls) > w) {
      out.push(line)
      line = words[i]
    } else line = next
  }
  if (line) out.push(line)
  if (out.length <= lines) return out
  // A clamp keeps its last line as wrapped and ends it with an ellipsis, trimmed only to make room.
  const kept = out.slice(0, lines)
  let last = kept[lines - 1]
  while (last.length > 1 && tw(last + '…', size, weight, ls) > w) last = last.slice(0, -1)
  kept[lines - 1] = last.replace(/\s+$/, '') + '…'
  return kept
}
// Centered lines around [cx], returning the block's height.
const centered = (o, cx, y, str, size, weight, color, w, lines, lh, ls = 0) => {
  const list = wrap(str, size, weight, w, lines, ls)
  list.forEach((line, i) => text(o, cx - tw(line, size, weight, ls) / 2, y + i * lh, line, size, weight, color, { lh, ls }))
  return list.length * lh
}

// A CSS linear gradient of one color over a box, baked once into a small image the way the details
// screens bake their scrims (utils/scrimImage.js), since bands of the renderer's two-color gradients
// show a seam where they meet once the stage scales them. [dir] is the way it runs ('right',
// 'bottom' or 'top'), [stops] [[0 to 1, '#rrggbbaa']] of one rgb, [r] the box's corner radius.
const baked = new Map()
const linear = (o, x, y, w, h, dir, stops, r = 0) => {
  const rgb = [1, 3, 5].map((i) => parseInt(stops[0][1].slice(i, i + 2), 16)).join(', ')
  const layer = { to: dir, rgb, stops: stops.map(([at, c]) => [at, Math.round((parseInt(c.slice(7, 9), 16) / 255) * 1000) / 1000]) }
  const key = JSON.stringify(layer)
  if (!baked.has(key)) {
    baked.set(key, scrimSrc([layer]))
  }
  const src = baked.get(key)
  if (src) o.boxes.push({ x, y, w, h, color: '#ffffffff', r, src, fit: null })
}

// The item's logo, or its title clamped to two lines, in a [w] by [h] box. [align] is bottomLeft,
// topLeft or bottomCenter. The logo is drawn once its size is known, contained in the box.
const logoOrTitle = (o, ctx, x, y, w, h, align, fallback) => {
  const item = ctx.item
  if (item.logoUrl) {
    // The logo keeps its place in the paint order while its size is unknown.
    const dim = ctx.logoDim
    if (!dim) return o.boxes.push({ x, y, w: 0, h: 0, color: '#00000000', r: 0, src: '', fit: null, key: 'logo' })
    const sc = Math.min(w / dim.w, h / dim.h)
    const lw = dim.w * sc
    const lh = dim.h * sc
    const lx = align === 'bottomCenter' ? x + (w - lw) / 2 : x
    const ly = align === 'topLeft' ? y : y + h - lh
    o.boxes.push({ x: lx, y: ly, w: lw, h: lh, color: '#ffffffff', r: 0, src: item.logoUrl, fit: null, key: 'logo' })
    return
  }
  const { size, weight, color, ls = 0, upper, shadow } = fallback
  const title = upper ? item.title.toUpperCase() : item.title
  const lines = wrap(title, size, weight, w, 2, ls)
  const top = align === 'topLeft' ? y : y + h - lines.length * LH
  lines.forEach((line, i) => {
    const lx = align === 'bottomCenter' ? x + (w - tw(line, size, weight, ls)) / 2 : x
    text(o, lx, top + i * LH, line, size, weight, color, { ls, shadow })
  })
}

// The ratings row on the sample scores at [x], [y], wrapping at [w]. Returns its height.
const ratings = (o, ctx, x, y, w, extra = {}) => {
  o.ratings = { x, y, maxW: w * 2, labels: extra.labels !== false, center: extra.center || 0 }
  return ctx.ratingsH
}

const pill = (o, x, y, w, h, color) => box(o, x, y, w, h, color, h / 2)
const circle = (o, x, y, d, fill, border, borderColor) => {
  box(o, x, y, d, d, fill, d / 2)
  if (border) ring(o, x, y, d, d, border, borderColor, d / 2)
}

// A tech chip: 2px 7px of padding inside a 1px border, 4 down from the line.
const TECH_CHIP_H = 33 + 4 + 2
const techChip = (o, x, y, label) => {
  const w = tw(label, 10, 600) + 16
  ring(o, x, y + 4, w, TECH_CHIP_H, 1, white(0.3), 4)
  text(o, x + 8, y + 4 + 3, label, 10, 600, white(0.8))
  return w
}
// The tech row: the size then the chips, or the size as the last chip. Returns its height.
const techRow = (o, t, x, y, w, tech, sizeAsChip) => {
  const items = []
  if (!sizeAsChip) items.push({ kind: 'size', w: tw(tech.size, 12, 700), h: 37 }, { kind: 'dot', w: 3 + 14, h: 37 })
  tech.badges.forEach((b) => items.push({ kind: 'chip', label: b.label, w: tw(b.label, 10, 600) + 16 + 6, h: 43 }))
  if (sizeAsChip) items.push({ kind: 'chip', label: tech.size, w: tw(tech.size, 10, 600) + 16 + 6, h: 43 })
  const lines = flow(items, w)
  let top = y
  lines.forEach((line) => {
    const lh = Math.max(...line.map((it) => it.h))
    line.forEach((it) => {
      const iy = top + (lh - it.h) / 2
      if (it.kind === 'size') text(o, x + it.x, iy + 4, tech.size, 12, 700, t.onSurfaceA(0.75))
      else if (it.kind === 'dot') text(o, x + it.x + 7, iy + 4, '·', 12, 400, t.onSurfaceA(0.5))
      else techChip(o, x + it.x, iy, it.label)
    })
    top += lh
  })
  return top - y
}
// Flex wrap: places [items] ({w}) in lines no wider than [w], each with its x.
const flow = (items, w) => {
  const lines = [[]]
  let x = 0
  items.forEach((it) => {
    if (x > 0 && x + it.w > w) {
      lines.push([])
      x = 0
    }
    lines[lines.length - 1].push({ ...it, x })
    x += it.w
  })
  return lines
}

const metaInline = (o, t, x, y, pieces, { gap, dots }) => {
  const style = t.onSurfaceA(0.75)
  let cx = x
  pieces.forEach((piece, i) => {
    if (i > 0) {
      if (dots) {
        cx += 8
        text(o, cx, y, '·', 14, 400, style)
        cx += tw('·', 14) + 8
      } else cx += gap
    }
    if (piece.id === 'runtimeAndSeasons') {
      icon(o, cx, y + 9.5, 14, ICON.schedule, style)
      cx += 18
    }
    text(o, cx, y, piece.text, 14, 400, style)
    cx += tw(piece.text, 14)
  })
}

// Play and the circles after it on Modern, Spotlight, Nouveau and Minimalist.
const playButton = (o, t, x, y, h, minW, iconSize) => {
  const label = $L('Play')
  const content = iconSize + 4 + tw(label, 13, 700)
  const w = Math.max(minW, content) + 24
  pill(o, x, y, w, h, t.accent)
  const cx = x + 10 + (w - 24 - content) / 2
  icon(o, cx, y + (h - iconSize) / 2, iconSize, ICON.playArrow, t.onAccent)
  text(o, cx + iconSize + 4, y + (h - LH) / 2, label, 13, 700, t.onAccent)
  return w
}
const actionCircles = (o, t, x, y, actions) => {
  const list = actions.inline.map((a) => a.icon).concat(actions.more ? [MORE_ICON] : [])
  list.forEach((src, i) => {
    const cx = x + 8 + i * 62
    circle(o, cx, y, 54, white(0.06), 1, t.onSurfaceA(0.35))
    icon(o, cx + 15, y + 15, 24, src, t.onSurface)
  })
}

const castRow = (o, t, x, y, radius) => {
  const d = radius * 2
  for (let i = 0; i < 8; i++) {
    const px = x + i * (d + 16)
    if (px > 960) break
    box(o, px, y, d, d, t.onSurfaceA(0.12), radius)
    box(o, px + (d - radius * 1.6) / 2, y + d + 6, radius * 1.6, 8, t.onSurfaceA(0.16), 4)
  }
  return d + 6 + 8
}

const heroBackdrop = (o, ctx, px, py) => {
  if (ctx.s.detailsBackdropEnabled !== false) art(o, 0, 0, 960, 540, ctx.item.backdropUrl, ctx.t, px, py)
}
const heroWash = (o, ctx, right, up) => {
  const { alpha, gradientScale: gs } = detailWash(ctx.s)
  const bg = (a) => ctx.t.backgroundA(a * gs)
  box(o, 0, 0, 960, 540, black(alpha))
  linear(o, 0, 0, 960, 540, 'right', right.map(([p, a]) => [p, a ? bg(a) : ctx.t.backgroundA(0)]))
  linear(o, 0, 0, 960, 540, 'top', up.map(([p, a]) => [p, a ? bg(a) : ctx.t.backgroundA(0)]))
}

// Classic (v1): the backdrop blurred, the title stack beside the poster, the action tiles
// centered under them, then Cast and More Like This.
const classic = (o, ctx) => {
  const { s, t, item, items } = ctx
  const tech = detailTech(s)
  const acts = detailActions('v1', s)
  const blur = Number(s.backdropBlurDetail != null ? s.backdropBlurDetail : 20)
  if (s.detailsBackdropEnabled !== false && item.backdropUrl) {
    // The server blurs it, at the radius CSS draws half the TV's blur at on this half size screen.
    art(o, 0, 0, 960, 540, (blur > 0 && serverBlurredUrl(item.backdropUrl, blur)) || item.backdropUrl, t)
  }
  linear(o, 0, 0, 960, 540, 'bottom', [[0, black(0.8)], [0.3, black(0.4)], [1, black(0.8)]])

  // The left column's height decides where it and the poster sit, bottom aligned.
  const W = 667
  const parts = (tech ? [tech.size] : []).concat(detailMeta(item, s).map((piece) => piece.text))
  const metaItems = []
  parts.forEach((part, i) => {
    if (i > 0) metaItems.push({ kind: 'sep', text: '•', w: tw('•', 12, 600), h: LH })
    const chip = item.officialRating && part === item.officialRating
    const bw = t.chipBorder.w
    metaItems.push(chip ? { kind: 'chip', text: part, w: tw(part, 11, 600) + 10 + 2 * bw, h: LH + 2 + 2 * bw } : { kind: 'text', text: part, w: tw(part, 12, 600), h: LH })
  })
  const metaLines = flow(metaItems, W)
  const metaH = metaItems.length ? metaLines.reduce((sum, line) => sum + Math.max(...line.map((it) => it.h)), 0) : 0
  const chipLines = tech ? flow(tech.badges.map((b) => ({ label: b.label, w: tw(b.label, 10, 600) + 16 + 6 })), W) : []
  const overview = item.overview || ''
  const overLines = overview ? wrap(overview, 14, 400, W, 4).length : 0
  const leftH = 80 + 12 + metaH + chipLines.length * 43 + 8 + ctx.ratingsH + (overview ? 8 + overLines * 19.6 : 0)
  const rowH = Math.max(leftH, 248)
  let y = 60 + rowH - leftH
  logoOrTitle(o, ctx, 48, y, 350, 80, 'bottomLeft', { size: 32, weight: 700, color: '#ffffffff', shadow: TEXT_SHADOW })
  y += 80 + 12
  metaLines.forEach((line) => {
    const lh = Math.max(...line.map((it) => it.h))
    line.forEach((it) => {
      const iy = y + (lh - it.h) / 2
      if (it.kind === 'chip') {
        ring(o, 48 + it.x, iy, it.w, it.h, t.chipBorder.w, t.chipBorder.color, 3)
        text(o, 48 + it.x + 5 + t.chipBorder.w, iy + 1 + t.chipBorder.w, it.text, 11, 600, t.onSurfaceA(0.9))
      } else text(o, 48 + it.x, iy, it.text, 12, 600, t.onSurfaceA(0.9))
    })
    y += lh
  })
  chipLines.forEach((line) => {
    line.forEach((it) => techChip(o, 48 + it.x, y, it.label))
    y += 43
  })
  y += 8
  y += ratings(o, ctx, 48, y, W)
  if (overview) text(o, 48, y + 8, overview, 14, 400, white(0.8), { maxw: W, lines: 4, lh: 19.6, shadow: TEXT_SHADOW })
  art(o, 747, 60 + rowH - 248, 165, 248, item.posterUrl, t, 0.5, 0.5, 8)

  // The tiles wrap in lines of eight and each line centers.
  const tiles = [{ src: ICON.play, label: $L('Play') }]
    .concat(acts.inline.map((a) => ({ src: a.icon, label: a.label })))
    .concat(acts.more ? [{ src: ICON.admin, label: $L('More') }] : [])
  y = 60 + rowH + 16
  const perLine = Math.floor(960 / 116)
  for (let at = 0; at < tiles.length; at += perLine) {
    const line = tiles.slice(at, at + perLine)
    const x0 = (960 - line.length * 116) / 2
    let lineH = 0
    line.forEach((tile, i) => {
      const tx = x0 + i * 116 + 4
      box(o, tx + 25, y, 58, 58, white(0.08), 15)
      icon(o, tx + 25 + 15.5, y + 15.5, 27, tile.src, t.onSurface)
      const labels = wrap(tile.label, 11, 600, 108, 2)
      labels.forEach((l, k) => text(o, tx + (108 - tw(l, 11, 600)) / 2, y + 66 + k * LH, l, 11, 600, t.onSurface))
      lineH = Math.max(lineH, 66 + labels.length * LH + 12)
    })
    y += lineH
  }
  y += 32
  text(o, 48, y, $L('Cast'), 20, 700, '#ffffffff', { shadow: TEXT_SHADOW })
  y += LH + 12
  y += castRow(o, t, 48, y, 45)
  y += 32
  text(o, 48, y, $L('More Like This'), 20, 700, '#ffffffff', { shadow: TEXT_SHADOW })
  y += LH + 12
  for (let i = 1; i < 8; i++) {
    const px = 48 + (i - 1) * 162
    if (px > 960 || y > 540) break
    const it = itemAt(items, i)
    art(o, px, y, 150, 225, it.posterUrl, t, 0.5, 0.5, 8)
    text(o, px, y + 231, it.title, 13, 700, '#ffffffff', { maxw: 150, lines: 1, shadow: TEXT_SHADOW })
  }
}

const tabsRow = (o, t, x, y, labels, selected) => {
  let w = 6
  const tabs = labels.map((label, i) => {
    const sel = i === 0 && selected
    const tw0 = tw(label, 13, sel ? 600 : 500) + 30
    const out = { label, x: w - 6, w: tw0, sel }
    w += tw0
    return out
  })
  pill(o, x, y, w, 44, t.onSurfaceA(0.08))
  tabs.forEach((tab) => {
    if (tab.sel) pill(o, x + 3 + tab.x, y + 3, tab.w, 38, t.accent)
    text(o, x + 3 + tab.x + 15, y + 3 + 2.5, tab.label, 13, tab.sel ? 600 : 500, tab.sel ? t.onAccent : t.onSurfaceA(0.75))
  })
}

// Modern (v2) and Spotlight (v3) share the hero, and Spotlight trades the tabs for its cards.
const modernHero = (o, ctx) => {
  const { s, t, item, variant } = ctx
  const spot = variant === 'v3'
  heroBackdrop(o, ctx, 1, 0.5)
  heroWash(o, ctx, [[0, 1], [0.35, 0.9], [0.6, 0.45], [0.85, 0]], [[0, 1], [0.45, 0.8], [0.8, 0]])
  const tech = detailTech(s)
  let y = 71
  logoOrTitle(o, ctx, 40, y, 300, 75, 'bottomLeft', { size: 34, weight: 700, color: t.onSurface })
  y += 75 + 10
  metaInline(o, t, 40, y, detailMeta(item, s), spot ? { gap: 16 } : { dots: true })
  y += LH
  if (tech) y += 6 + techRow(o, t, 40, y + 6, 816, tech, false)
  y += 6
  y += ratings(o, ctx, 40, y, 816)
  if (item.overview) y += 8 + para(o, 40, y + 8, item.overview, 14, 400, t.onSurfaceA(0.85), 800, spot ? 3 : 4, 20.3)
  y += spot ? 20 : 24
  const pw = playButton(o, t, 40, y, 54, 200, 24)
  actionCircles(o, t, 40 + pw, y, detailActions(variant, s))
  y += 54
  if (spot) {
    y += 28
    const cards = [
      [$L('Cast, Crew, and Studios'), $L('{count} people').replace('{count}', 24)],
      [$L('Chapters and Extras'), $L('{count} chapters').replace('{count}', 18)],
      [$L('Recommendations'), $L('{count} titles').replace('{count}', 12)],
    ]
    cards.forEach(([label, count], i) => {
      const cx = 40 + i * 208
      box(o, cx, y, 192, 110, t.onSurfaceA(0.06), 14)
      linear(o, cx + 1, y + 1, 190, 108, 'bottom', [[0.35, t.backgroundA(0.05)], [0.65, t.backgroundA(0.45)], [1, t.backgroundA(0.85)]], 13)
      ring(o, cx, y, 192, 110, 1, t.onSurfaceA(0.12), 14)
      box(o, cx + 11, y + 11, 28, 28, t.backgroundA(0.45), 14)
      const labelLines = wrap(label, 14, 700, 166, 9)
      const top = y + 1 + 108 - 10 - (labelLines.length + 1) * LH
      labelLines.forEach((l, k) => text(o, cx + 13, top + k * LH, l, 14, 700, t.onSurface))
      text(o, cx + 13, top + labelLines.length * LH, count, 11, 400, t.onSurfaceA(0.75))
    })
    return
  }
  y += 16
  const expanded = !!s.detailExpandedTabs
  tabsRow(o, t, 40, y, [$L('Cast'), $L('Studios'), $L('Chapters'), $L('Details'), $L('More Like This')], expanded)
  y += 44
  if (expanded) castRow(o, t, 40, y + 8, 45)
}

// Nouveau (v4): the hero shallow, then two rails already under it.
const nouveau = (o, ctx) => {
  const { s, t, item } = ctx
  heroBackdrop(o, ctx, 1, 0.5)
  heroWash(o, ctx, [[0, 0.96], [0.18, 0.86], [0.38, 0.58], [0.6, 0.22], [0.82, 0]], [[0, 1], [0.2, 0.96], [0.45, 0.76], [0.8, 0]])
  const tech = detailTech(s)
  let y = 48
  logoOrTitle(o, ctx, 40, y, 260, 62, 'bottomLeft', { size: 30, weight: 700, color: t.onSurface })
  y += 62 + 8
  const pieces = []
  if (item.year) pieces.push({ id: 'year', text: String(item.year) })
  if (item.officialRating) pieces.push({ id: 'rating', text: item.officialRating })
  if (item.genres.length > 0) pieces.push({ id: 'genres', text: item.genres.slice(0, 3).join(' · ') })
  metaInline(o, t, 40, y, pieces, { gap: 16 })
  y += LH
  if (tech) y += 6 + techRow(o, t, 40, y + 6, 816, tech, true)
  y += 6
  y += ratings(o, ctx, 40, y, 816)
  if (item.overview) y += 8 + para(o, 40, y + 8, item.overview, 13, 400, t.onSurfaceA(0.85), 760, 2, 18.85)
  y += 14
  const pw = playButton(o, t, 40, y + 4, 46, 170, 22)
  actionCircles(o, t, 40 + pw, y, detailActions('v4', s))
  y += 54
  const rail = (label, count, wide) => {
    y += 18
    text(o, 40, y, label, 13, 700, t.onSurfaceA(0.85))
    y += LH + 8
    for (let i = 0; i < count; i++) box(o, 40 + i * ((wide ? 96 : 54) + 10), y, wide ? 96 : 54, wide ? 54 : 81, t.onSurfaceA(i === 0 ? 0.28 : 0.14), 6)
    y += wide ? 54 : 81
  }
  rail($L('Chapters'), 5, true)
  rail($L('Recommendations'), 7, false)
}

// Minimalist (v5): the title, play and the episodes along the bottom, the rest picture.
const minimalist = (o, ctx) => {
  const { s, t } = ctx
  heroBackdrop(o, ctx, 1, 0.5)
  box(o, 0, 0, 960, 540, black(minimalistScrimAlpha(s.backdropBlurDetail)))
  const cardH = (118 * 9) / 16
  const cardsY = 540 - 24 - cardH
  const actY = cardsY - 18 - 54
  logoOrTitle(o, ctx, 28, actY - 14 - 52, 220, 52, 'bottomLeft', { size: 30, weight: 700, color: t.onSurface })
  const pw = playButton(o, t, 28, actY + 4, 46, 150, 22)
  actionCircles(o, t, 28 + pw, actY, detailActions('v5', s))
  for (let i = 0; i < 4; i++) box(o, 28 + i * 128, cardsY, 118, cardH, t.onSurfaceA(0.16), 7)
}

const circleIcons = (acts) => acts.inline.map((a) => a.icon).concat(acts.more ? [MORE_ICON] : [])

// Stage (v6): the poster with play and the circles under it, the title and facts beside it.
const stage = (o, ctx) => {
  const { s, t, item } = ctx
  heroBackdrop(o, ctx, 0.5, 0.5)
  box(o, 0, 0, 960, 540, black(stageScrimAlpha(s.backdropBlurDetail)))
  art(o, 40, 86, 194, 291, item.posterUrl || item.backdropUrl, t, 0.5, 0.5, 6.5)
  let y = 86 + 291 + 14
  pill(o, 40, y, 194, 43, t.accent)
  const label = $L('Play')
  const content = 20 + 6 + tw(label, 12, 700)
  const cx = 40 + (194 - content) / 2
  icon(o, cx, y + 11.5, 20, ICON.playArrow, t.onAccent)
  text(o, cx + 26, y + 5, label, 12, 700, t.onAccent)
  y += 43 + 12
  // The circles shrink alike when they overflow the poster's width, as flex items do.
  const icons = circleIcons(detailActions('v6', s))
  const gaps = icons.reduce((sum, _, i) => sum + (i < 3 && i < icons.length - 1 ? 7.3 : 0), 0)
  const cw = Math.min(45, (194 - gaps) / Math.max(1, icons.length))
  let px = 40
  icons.forEach((src, i) => {
    box(o, px, y, cw, 45, white(0.06), [cw / 2, cw / 2, cw / 2, cw / 2])
    ring(o, px, y, cw, 45, 1, t.onSurfaceA(0.35), cw / 2)
    icon(o, px + (cw - 20) / 2, y + 12.5, 20, src, t.onSurface)
    px += cw + (i < 3 ? 7.3 : 0)
  })

  const x = 268
  y = 86
  logoOrTitle(o, ctx, x, y, 300, 86, 'topLeft', { size: 31.5, weight: 700, color: t.onSurface })
  y += 86
  const meta = detailMeta(item, s).map((piece) => piece.text).join(' · ')
  if (meta) {
    y += 10
    y += para(o, x, y, meta, 13, 400, t.onSurfaceA(0.75), 652, 9, LH)
  }
  y += 6
  y += ratings(o, ctx, x, y, 652)
  if (item.overview) y += 8 + para(o, x, y + 8, item.overview, 13, 400, t.onSurfaceA(0.85), 600, 4, 18.85)
  y += 14
  let chipX = x
  ;[$L('Audio'), $L('Subtitle')].forEach((chip) => {
    const w = tw(chip, 11) + 26
    box(o, chipX, y, w, 30, white(0.06), 15)
    ring(o, chipX, y, w, 30, 1, t.onSurfaceA(0.22), 15)
    text(o, chipX + 13, y + 1 - 2.5, chip, 11, 400, t.onSurfaceA(0.7))
    chipX += w + 6
  })
}

// The Premiere, Quick Look and Frost play pill: a 42 wide icon cell, then the label.
const smallPlay = (o, t, x, y) => {
  const label = $L('Play')
  const w = 5 + 42 + 5 + tw(label, 11, 700) + 13
  pill(o, x, y, w, 45, t.accent)
  icon(o, x + 5 + 11, y + 12.5, 20, ICON.playArrow, t.onAccent)
  text(o, x + 52, y + 6, label, 11, 700, t.onAccent)
  return w
}
const smallCircles = (o, t, x, y, icons) => {
  icons.forEach((src, i) => {
    const cx = x + 6.7 + i * 51.7
    circle(o, cx, y, 45, white(0.06), 1, t.onSurfaceA(0.35))
    icon(o, cx + 12.5, y + 12.5, 20, src, t.onSurface)
  })
  return icons.length * 51.7
}

// Premiere (v7): the title centered low over a full screen backdrop, play and the circles under it,
// the ratings, and an arrow hinting at the rest of the page.
const premiere = (o, ctx) => {
  const { s, t, item } = ctx
  if (s.detailsBackdropEnabled !== false) art(o, 0, 0, 960, 540, item.backdropUrl, t, 0.5, 0)
  if (ctx.premiereScrim) o.boxes.push({ x: 0, y: 0, w: 960, h: 540, color: '#ffffffff', r: 0, src: ctx.premiereScrim, fit: null })
  const meta = detailMeta(item, s).map((piece) => piece.text).join(' • ')
  const metaLines = meta ? wrap(meta, 13, 700, 806, 9) : []
  const overLines = item.overview ? wrap(item.overview, 12, 400, 634, 3) : []
  const icons = circleIcons(detailActions('v7', s))
  const rh = ctx.ratingsH
  const blockH = 119 + (meta ? 10 + metaLines.length * LH : 0) + (overLines.length ? 8 + overLines.length * 18 : 0) + 18 + 45 + 18 + rh + 10 + PREMIERE_ARROW_H
  let y = 530 - blockH
  logoOrTitle(o, ctx, 480 - 217, y, 434, 119, 'bottomCenter', { size: 50, weight: 700, color: t.onSurface, ls: 3.3, upper: true })
  y += 119
  if (meta) y += 10 + centered(o, 480, y + 10, meta, 13, 700, t.onSurface, 806, 9, LH)
  if (overLines.length) y += 8 + centered(o, 480, y + 8, item.overview, 12, 400, t.onSurfaceA(0.82), 634, 3, 18)
  y += 18
  const label = $L('Play')
  const rowW = 5 + 42 + 5 + tw(label, 11, 700) + 13 + icons.length * 51.7
  const px = 480 - rowW / 2
  const pw = smallPlay(o, t, px, y)
  smallCircles(o, t, px + pw, y, icons)
  y += 45 + 18
  y += ratings(o, ctx, 0, y, 806, { center: 480 })
  y += 10
  icon(o, 480 - 12.5, y + PREMIERE_ARROW_TOP, 25, ICON.arrowDown, t.onSurfaceA(0.65))
}
// The arrow is an inline svg on the 33px line, sitting on its baseline.
const PREMIERE_ARROW_H = 33
const PREMIERE_ARROW_TOP = 2

// Quick Look (v8): a drawer down the right over a dimmed row of titles.
const quickLook = (o, ctx) => {
  const { s, t, item, items } = ctx
  const shown = items.slice(0, 5)
  const pw = (900 - 10 * (shown.length - 1)) / shown.length
  shown.forEach((it, i) => art(o, 30 + i * (pw + 10), 30, pw, 270, it.posterUrl || it.backdropUrl, t, 0.5, 0.5, 7))
  box(o, 0, 0, 960, 540, black(0.62))
  const surface = ctx.quickLookSurface
  // Half the width inside its 1px left border, so the drawer starts a pixel left of the middle.
  box(o, 479, 0, 481, 540, surface)
  box(o, 479, 0, 1, 540, white(0.1))
  const showImage = s.detailsBackdropEnabled !== false && Boolean(item.backdropUrl)
  if (showImage) {
    art(o, 480, 0, 480, 173, item.backdropUrl, t, 0.5, 0.3)
    linear(o, 480, 0, 480, 173, 'bottom', [[0.4, ofRgb(surface, 0)], [1, surface]])
  }
  const back = $L('Back to close')
  const bw = tw(back, 10) + 20
  pill(o, 960 - 11.7 - bw, 11.7, bw, 43, black(0.5))
  text(o, 960 - 11.7 - bw + 10, 16.7, back, 10, 400, white(0.85))
  const x = 501.7
  const W = 436.6
  let y = showImage ? 144.6 : 53.5
  y += para(o, x, y, item.title, 22.5, 700, t.onSurface, W, 2, 25.875)
  const meta = detailMeta(item, s).map((piece) => piece.text).join(' · ')
  if (meta) {
    text(o, x, y + 5, meta, 10, 700, t.onSurface, { maxw: W, lines: 1 })
    y += 5 + LH
  }
  y += 8.35
  y += ratings(o, ctx, x, y, W, { labels: false })
  y += 13.4
  const pw2 = smallPlay(o, t, x, y)
  smallCircles(o, t, x + pw2, y, circleIcons(detailActions('v8', s)))
  y += 45
  if (item.overview) para(o, x, y + 10, item.overview, 11.7, 400, t.onSurfaceA(0.82), W, 3, 17.55)
  const fy = 540 - 18.3 - 40.4
  ring(o, x, fy, W, 40.4, 1, t.onSurfaceA(0.25), 20.2)
  const open = $L('Open full page')
  text(o, x + (W - tw(open, 11.7, 600)) / 2, fy + 1 + (38.4 - LH) / 2, open, 11.7, 600, t.onSurface)
}

// Frost (v9): the art blurred behind a glass window that holds it sharp, the toolbar over the
// window's foot and the tabs under it.
const frost = (o, ctx) => {
  const { s, t, item } = ctx
  const artUrl = s.detailsBackdropEnabled !== false ? item.backdropUrl : null
  const blurred = serverBlurredUrl(artUrl, 60)
  // shortcut: without a server blurred url (art the server didn't serve) the backdrop draws sharp
  // instead of blurred by 30px. Bake a blur if art from outside the server ever reaches the preview.
  art(o, 0, 0, 960, 540, blurred || artUrl, t)
  box(o, 0, 0, 960, 540, black(0.55))
  box(o, 18, 9, 924, 421.5, rgba(28, 28, 32, 0.55), 33)
  if (artUrl) art(o, 18, 9, 924, 421.5, artUrl, t, 0.5, 0.5, 33)
  const ink = (a) => rgba(12, 12, 14, a)
  linear(o, 18, 9, 924, 421.5, 'top', [[0, ink(0.95)], [0.5, ink(0.74)], [0.8, ink(0)]], 33)

  const meta = detailMeta(item, s).map((piece) => piece.text).join(' · ')
  const titleLines = wrap(item.title, 48, 800, 840, 2, -1.2).length
  const strip = ctx.strip
  const overLines = item.overview ? wrap(item.overview, 13.5, 400, 498, 3).length : 0
  const blockH = titleLines * 52.8 + (meta ? 9 + LH : 0) + (strip.length ? 10.5 + 75 : 0) + (overLines ? 18 + overLines * 19.575 : 0)
  let y = 9 + 421.5 - 48 - blockH
  text(o, 60, y, item.title, 48, 800, '#ffffffff', { maxw: 840, lines: 2, lh: 52.8, ls: -1.2 })
  y += titleLines * 52.8
  if (meta) {
    text(o, 60, y + 9, meta, 13.5, 500, rgba(235, 235, 245, 0.78), { maxw: 840, lines: 1 })
    y += 9 + LH
  }
  if (strip.length) {
    y += 10.5
    // The strip's 1.5px rules, drawn at half size, round to a pixel.
    box(o, 60, y, 840, 1, white(0.14))
    box(o, 60, y + 74, 840, 1, white(0.14))
    const cw = 840 / strip.length
    strip.forEach((entry, i) => {
      const cx = 60 + i * cw
      if (i > 0) box(o, cx, y + 1, 1, 73, white(0.14))
      // The name over the value, centered in the column as a pair: 11.25 + 3 + 24.15 tall.
      const top = y + (75 - 38.4) / 2
      const name = entry.name.toUpperCase()
      const nw = Math.min(tw(name, 9, 600, 0.45), cw - 6)
      text(o, cx + (cw - nw) / 2, top, name, 9, 600, rgba(235, 235, 245, 0.62), { lh: 11.25, ls: 0.45, maxw: cw - 6, lines: 1 })
      const vw = tw(entry.value, 21, 700, -0.375)
      text(o, cx + (cw - vw) / 2, top + 11.25 + 3, entry.value, 21, 700, white(0.94), { lh: 24.15, ls: -0.375 })
    })
    y += 75
  }
  if (overLines) para(o, 60, y + 18, item.overview, 13.5, 400, white(0.9), 498, 3, 19.575)

  // The toolbar: Play and the circles in a glass bar.
  const icons = circleIcons(detailActions('v9', s))
  const label = $L('Play')
  const playW = Math.max(150, 42 + 19 + 7.5 + tw(label, 14.25, 600))
  const contentW = playW + icons.reduce((sum, _, i) => sum + 45 + (i ? 4.5 : 9), 0)
  const barW = contentW + 14
  const bx = 480 - barW / 2
  box(o, bx, 403.5, barW, 59, rgba(48, 48, 54, 0.9), 28.5)
  ring(o, bx, 403.5, barW, 59, 1, white(0.08), 28.5)
  pill(o, bx + 7, 410.5, playW, 45, white(0.86))
  const inner = 19 + 7.5 + tw(label, 14.25, 600)
  icon(o, bx + 7 + (playW - inner) / 2, 410.5 + 13, 19, ICON.playArrow, '#000000ff')
  text(o, bx + 7 + (playW - inner) / 2 + 26.5, 410.5 + 6, label, 14.25, 600, '#000000ff')
  let cx = bx + 7 + playW
  icons.forEach((src, i) => {
    cx += i ? 4.5 : 9
    icon(o, cx + 13, 410.5 + 13, 19, src, '#ffffffff')
    cx += 45
  })

  const tabs = [$L('Overview'), $L('Cast & Crew'), $L('More Like This'), $L('Details')]
  const widths = tabs.map((tab) => tw(tab, 12, 600) + 27)
  const tabsW = 11 + widths.reduce((a, b) => a + b, 0) + 3 * (tabs.length - 1)
  const tx = 480 - tabsW / 2
  box(o, tx, 468, tabsW, 47, rgba(48, 48, 54, 0.9), 22.5)
  ring(o, tx, 468, tabsW, 47, 1, white(0.08), 22.5)
  let x = tx + 5.5
  tabs.forEach((tab, i) => {
    if (i === 0) pill(o, x, 473.5, widths[i], 36, white(0.16))
    text(o, x + 13.5, 473.5 + 1.5, tab, 12, 600, '#ffffffff')
    x += widths[i] + 3
  })
}

const VARIANTS = { v1: classic, v2: modernHero, v3: modernHero, v4: nouveau, v5: minimalist, v6: stage, v7: premiere, v8: quickLook, v9: frost }

// [ctx]: { s, t, item, items, variant, logoDim, ratingsH, strip, premiereScrim, quickLookSurface }.
export const detailScene = (ctx) => {
  const o = newOut()
  const draw = VARIANTS[ctx.variant] || modernHero
  draw(o, { ...ctx, variant: VARIANTS[ctx.variant] ? ctx.variant : 'v2' })
  // Nothing below the screen's foot shows.
  o.boxes = o.boxes.filter((b) => b.y < 540)
  o.texts = o.texts.filter((b) => b.y < 540)
  return o
}

// The stand-ins drawn while the sample items load, on a 320 by 200 box scaled into the screen.

const bar = (o, x, y, w, h, color) => box(o, x, y, w, h, color, h / 2)
const poster = (o, x, y, w, t) => box(o, x, y, w, w * 1.5, t.onSurfaceA(0.16), 3)
const backdrop = (o, x, y, w, h) => o.grads.push({ x, y, w, h })

const FALLBACKS = {
  v9: (o, t, strong, weak) => {
    backdrop(o, 0, 0, 320, 200)
    box(o, 0, 0, 320, 200, black(0.45))
    box(o, 8, 5, 304, 167, t.surfaceA(0.6), 12)
    bar(o, 18, 172 - 10 - 5 - 5 - 8, 56, 8, strong)
    bar(o, 18, 172 - 10 - 5, 40, 5, weak)
    bar(o, 130, 200 - 22 - 12, 60, 12, weak)
    bar(o, 115, 200 - 5 - 10, 90, 10, weak)
  },
  v8: (o, t, strong, weak) => {
    backdrop(o, 0, 0, 320, 200)
    box(o, 0, 0, 320, 200, black(0.62))
    // Half the width plus its padding, against the right edge.
    box(o, 144, 0, 176, 200, t.surface)
    // Eight of padding, then a third of the free height above the bars and two thirds under.
    const free = 200 - 16 - (8 + 5 + 5 + 5 + 8)
    let y = 8 + free / 3
    bar(o, 152, y, 48, 8, strong)
    y += 8 + 5
    bar(o, 152, y, 36, 5, weak)
    y += 5 + 5
    bar(o, 152, y, 22, 8, strong)
    bar(o, 178, y, 8, 8, weak)
    bar(o, 190, y, 8, 8, weak)
  },
  v7: (o, t, strong, weak) => {
    // A full size box with padding outgrows the frame, so its column ends 10 under the foot and
    // centers 10 right of the middle, and the button row falls out of sight.
    backdrop(o, 0, 0, 320, 200)
    let y = 210 - 8 - 5 - 5 - 5 - 9
    bar(o, 140, y, 60, 9, strong)
    y += 9 + 5
    bar(o, 148, y, 44, 5, weak)
    y += 5 + 5
    bar(o, 145, y, 26, 8, strong)
    bar(o, 175, y, 8, 8, weak)
    bar(o, 187, y, 8, 8, weak)
  },
  v6: (o, t, strong, weak) => {
    backdrop(o, 0, 0, 320, 200)
    poster(o, 10, 10, 30, t)
    bar(o, 10, 10 + 45 + 5, 30, 8, strong)
    bar(o, 48, 10, 52, 9, strong)
    bar(o, 48, 24, 40, 5, weak)
    bar(o, 48, 34, 64, 5, weak)
    bar(o, 48, 44, 58, 5, weak)
  },
  v5: (o, t, strong, weak) => {
    // Its bottom padding falls outside the frame, so the column ends at the foot.
    let y = 200 - 20 - 8 - 11 - 6 - 9
    bar(o, 10, y, 58, 9, strong)
    y += 9 + 6
    bar(o, 10, y, 40, 11, strong)
    bar(o, 55, y, 11, 11, weak)
    bar(o, 71, y, 11, 11, weak)
    y += 11 + 8
    for (let i = 0; i < 3; i++) bar(o, 10 + i * 39, y, 34, 20, weak)
  },
  v1: (o, t, strong, weak) => {
    let y = (200 - (45 + 5 + 4 + 5 + 3 + 5 + 10)) / 2
    poster(o, 145, y, 30, t)
    y += 45 + 5
    bar(o, 135, y, 50, 4, strong)
    y += 4 + 5
    bar(o, 144, y, 32, 3, weak)
    y += 3 + 5
    box(o, 143, y, 34, 10, t.onSurfaceA(0.85), 5)
  },
  v2: (o, t, strong, weak) => {
    // Flex shares out what the lower part's 8 of padding leaves, four tenths to the backdrop.
    const top = (200 - 8) * 0.4
    backdrop(o, 0, 0, 320, top)
    bar(o, 10, top - 12, 46, 4, strong)
    bar(o, 10, top - 12 + 4 + 4, 30, 3, weak)
    const y = 200 - 8 - 3
    bar(o, 10, y, 16, 3, strong)
    bar(o, 34, y, 16, 3, weak)
    bar(o, 58, y, 16, 3, weak)
  },
}

// The stand-in for [variant] scaled to fit the 960 by 540 screen and centered.
export const detailFallback = (variant, t) => {
  const o = newOut()
  const strong = t.onSurfaceA(0.78)
  const weak = t.onSurfaceA(0.3)
  ;(FALLBACKS[variant] || FALLBACKS.v2)(o, t, strong, weak)
  o.boxes = o.boxes.filter((b) => b.y < 200)
  const k = Math.min(960 / 320, 540 / 200)
  const ox = (960 - 320 * k) / 2
  const oy = (540 - 200 * k) / 2
  const place = (n) => ({ ...n, x: ox + n.x * k, y: oy + n.y * k, w: n.w * k, h: n.h * k, r: Array.isArray(n.r) ? n.r.map((v) => v * k) : (n.r || 0) * k })
  o.boxes = o.boxes.map(place)
  o.grads = o.grads.map(place)
  return o
}
