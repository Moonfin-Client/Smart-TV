// Premiere's first screen as a display list: the logo or title centered at the foot of the screen
// with its subtitle, facts, tagline, as much overview as fits and Seerr's download bars, then the
// buttons, the ratings and the arrow pointing to the sections further down.
import { textWidth } from '../../../ui/components/details/measure.js'
import { cssShift, fontFor, themeSpacing } from '../../../ui/text.js'
import { stageMetaLine, stagePieces, stageRatings, stageTechLine } from '../stage/layout.js'
import { stageSubtitle } from '../stage/stageRules.js'
import { emptyList } from '../stage/Draw.js'

export const HERO_PAD_X = 154
export const VIEW_H = 1080
const HERO_PAD_BOTTOM = 20
const LOGO_BOX = { w: 868, h: 238 }
const TITLE_SHADOW = { color: '#00000099', x: 0, y: 0, blur: 48 }

// Only Roboto's canvas face draws italics, so the tagline uses it.
// shortcut: a theme's own face draws upright, slant it when the renderer can italicize SDF text.
const italicFace = (str) => {
  const face = fontFor(str, 'regular')
  return /^roboto/.test(face) ? 'roboto-web' : face
}

// The page's own 154px inset already clears Reel's and Mosaic's resting control, so only the
// classic sidebar moves it.
export const premiereLeft = (room) => (room === 'rail' ? 200 : HERO_PAD_X)

// Wraps between words and after a word's hyphens. `ls` is the text's own letter spacing, or null to
// inherit Neon Pulse's 0.6px, which textWidth already counts in that face. Returns the lines, their
// measure and the spacing to draw them with.
export const wrapSpaced = (text, size, weight, maxW, ls) => {
  const str = String(text || '')
  const inherit = /^neon-/.test(fontFor(str, weight)) ? themeSpacing() : 0
  const own = ls == null ? inherit : ls
  const width = (s) => textWidth(s, size, weight) + (own - inherit) * s.length
  const out = []
  let line = ''
  str
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word) => {
      word.match(/[^-]+-*|-+/g).forEach((part, i) => {
        const next = line ? line + (i ? '' : ' ') + part : part
        if (!line || width(next) <= maxW) line = next
        else {
          out.push(line)
          line = part
        }
      })
    })
  if (line) out.push(line)
  return { lines: out, width, ls: own }
}

// The overview's lines that fit in `room` px, the last one cut at a word with an ellipsis when some
// are given up.
export const fitLines = (lines, room, lh) => {
  const fit = lines.slice(0, Math.max(0, Math.floor((room + 1) / lh)))
  if (fit.length < lines.length && fit.length) fit[fit.length - 1] = `${fit[fit.length - 1].replace(/\s*\S*$/, '')}…`
  return fit
}

// The loading skeleton: the title, the facts line, two lines of overview and the button row, all at
// the foot of the screen.
export const premiereSkeleton = (L, box) => {
  const cx = L + (1920 - L - HERO_PAD_X) / 2
  const out = []
  let y = VIEW_H - 90 - 83.5
  const rowW = 250 + 4 * (83.5 + 20)
  ;[250, 83.5, 83.5, 83.5, 83.5].reduce((x, w, i) => {
    out.push({ k: `b${i}`, x, y, w, h: 83.5, r: 41.75, color: box })
    return x + w + 20
  }, cx - rowW / 2)
  const add = (k, w, h, r = 8) => {
    y -= h
    out.push({ k, x: cx - w / 2, y, w, h, r, color: box })
  }
  y -= 33.4
  add('o1', 701, 23.4, 4)
  y -= 13.4
  add('o0', 1035, 23.4, 4)
  y -= 23.4
  add('meta', 501, 26.7, 4)
  y -= 23.4
  add('title', 701, 93.5)
  return out
}

// The hero into `out`, laid out up from the foot of the first screen. `logo` is the measured logo
// ({url, w, h}), null for the title, or 'pending' while it loads, when neither shows. `bars` is
// downloadsLayout()'s answer for Seerr's downloads. Returns where the buttons and the bars go.
export const layoutHero = (out, v, { L, logo, arrow, bars }) => {
  const it = v.item
  const t = v.tokens
  const heroW = 1920 - L - HERO_PAD_X
  const cx = L + heroW / 2
  let bottom = VIEW_H - HERO_PAD_BOTTOM
  if (arrow) {
    out.imgs.push({ k: 'arrow', x: cx - 25, y: bottom - 50, w: 50, h: 50, src: 'icons/d/core_keyboard_arrow_down.webp', color: '#ffffffa6' })
    bottom -= 70
  }
  const ratingsH = stageRatings(emptyList(), v, 0, 0, heroW, t, { center: true })
  if (ratingsH) {
    stageRatings(out, v, L, bottom - ratingsH, heroW, t, { center: true })
    bottom -= ratingsH + 26.7
  }
  const actY = bottom - 36.7 - 90
  bottom = actY - 36.7

  const partOfShow = it.Type === 'Season' || it.Type === 'Episode'
  const name = (partOfShow && it.SeriesName) || it.Name || ''
  const parts = []
  if (logo && logo !== 'pending') {
    const k = Math.min(LOGO_BOX.w / logo.w, LOGO_BOX.h / logo.h)
    parts.push({ h: logo.h * k, draw: (top) => out.imgs.push({ k: 'logo', x: cx - (logo.w * k) / 2, y: top, w: logo.w * k, h: logo.h * k, src: logo.url, fit: 'contain' }) })
  } else if (!logo) {
    const w = wrapSpaced(name.toUpperCase(), 100, 'bold', heroW, 6.7)
    const lines = w.lines.slice(0, 2)
    parts.push({
      h: lines.length * 105,
      draw: (top) =>
        lines.forEach((ln, i) =>
          out.texts.push({ k: `title${i}`, x: cx - w.width(ln) / 2, y: top + i * 105 + cssShift(100), text: ln, size: 100, font: fontFor(ln, 'bold'), color: '#ffffffff', lh: 105, ls: 6.7, shadow: TITLE_SHADOW }),
        ),
    })
  }
  const subtitle = stageSubtitle(it)
  if (subtitle) {
    const w = wrapSpaced(subtitle, 40, 'bold', heroW, null)
    const lines = w.lines.slice(0, 2)
    parts.push({
      gap: 16.7,
      h: lines.length * 48,
      draw: (top) =>
        lines.forEach((ln, i) =>
          out.texts.push({ k: `sub${i}`, x: cx - w.width(ln) / 2, y: top + i * 48 + cssShift(40), text: ln, size: 40, font: fontFor(ln, 'bold'), color: '#ffffffff', lh: 48, ls: w.ls, shadow: TITLE_SHADOW }),
        ),
    })
  }
  const pieces = stagePieces(v)
  const metaH = stageMetaLine(emptyList(), pieces, 0, 0, heroW, t, { center: true, ls: 0.67 })
  const techH = v.techChips.length ? 10 + stageTechLine(emptyList(), v.techChips, 0, 0, heroW, { center: true, ls: 0.67 }) : 0
  parts.push({
    gap: 20,
    h: metaH + techH,
    draw: (top) => {
      stageMetaLine(out, pieces, L, top, heroW, t, { center: true, ls: 0.67 })
      if (techH) stageTechLine(out, v.techChips, L, top + metaH + 10, heroW, { center: true, ls: 0.67 })
    },
  })
  if (v.incomplete) {
    const iw = textWidth(v.incomplete, 20, 'bold')
    parts.push({
      gap: 8,
      h: 33,
      draw: (top) =>
        out.texts.push({ k: 'incomplete', x: cx - Math.min(iw, heroW) / 2, y: top + cssShift(20), text: v.incomplete, size: 20, font: fontFor(v.incomplete, 'bold'), color: '#e0a33cff', lh: 33, maxw: heroW, maxlines: 1 }),
    })
  }
  if (v.tagline) {
    const w = wrapSpaced(v.tagline, 26.7, 'regular', heroW, 0.83)
    parts.push({
      gap: 20,
      h: w.lines.length * 40.05,
      draw: (top) =>
        w.lines.forEach((ln, i) =>
          out.texts.push({ k: `tag${i}`, x: cx - w.width(ln) / 2, y: top + i * 40.05 + cssShift(26.7), text: `[i]${ln.replace(/\[/g, '(')}[/i]`, rich: true, size: 26.7, font: italicFace(ln), color: '#ffffffd1', lh: 40.05, ls: 0.83 }),
        ),
    })
  }
  // Seerr's download bars go 20px under the overview, in a box up to 868 wide.
  const fixed = parts.reduce((sum, p) => sum + (p.gap || 0) + p.h, 0) + (bars.h ? 20 + bars.h : 0)
  const overviewText = !v.hideDescription ? v.overviewText : ''
  if (overviewText) {
    // The whole overview, unless it would push the title off the top, when it gives up the lines
    // there's no room for.
    const w = wrapSpaced(overviewText, 23.4, 'regular', Math.min(1269, heroW), 0.42)
    const lines = fitLines(w.lines, bottom - fixed - 16.7, 35.1)
    if (lines.length) {
      parts.push({
        gap: 16.7,
        h: lines.length * 35.1,
        draw: (top) =>
          lines.forEach((ln, i) =>
            out.texts.push({ k: `ov${i}`, x: cx - w.width(ln) / 2, y: top + i * 35.1 + cssShift(23.4), text: ln, size: 23.4, font: fontFor(ln, 'regular'), color: '#ffffffd1', lh: 35.1, ls: 0.42 }),
          ),
      })
    }
  }
  let barsY = 0
  if (bars.h) parts.push({ gap: 20, h: bars.h, draw: (top) => (barsY = top) })
  const total = parts.reduce((sum, p, i) => sum + (i ? p.gap || 0 : 0) + p.h, 0)
  let top = bottom - total
  parts.forEach((p, i) => {
    if (i) top += p.gap || 0
    p.draw(top)
    top += p.h
  })
  return { actY, heroW, dl: { x: cx - Math.min(868, heroW) / 2, y: barsY, bars } }
}
