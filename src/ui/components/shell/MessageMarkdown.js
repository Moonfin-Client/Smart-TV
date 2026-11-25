// Server messages and release notes: the blocks utils/markdown.js reads, laid out the way CSS
// flows them, as plain lists of texts and rects to draw. The renderer has no inline styling, so each
// run of one style on a line is its own text, placed at the width Chrome gives the runs before it.
import { cssShift, sdfSafe, textReady, uiUsesSdf } from '../../text.js'

const DP = 1.66957
const dp = (n) => n * DP

// CoreDialog's panel and the alert name Roboto for themselves, so their text keeps it under a theme
// that sets its own face everywhere else (only their titles and buttons take the theme's).
const ROBOTO = { regular: ['roboto', 'roboto-web'], medium: ['roboto-medium', 'roboto-medium-web'], bold: ['roboto-bold', 'roboto-bold-web'] }
export const roboto = (weight = 'regular', str) => ROBOTO[weight][(str == null ? uiUsesSdf() : sdfSafe(str)) ? 0 : 1]
export const robotoShift = (size) => cssShift(size, 'roboto')

// Roboto's width in Chrome, from the faces textReady() loads to measure with. Boot awaits them, so
// asking from the start means the first layout already measures (the release notes lay out only
// when opened, and never again).
let ready = false
let ctx = null
const widths = {}
textReady().then(() => {
  ready = true
})
export const robotoWidth = (text, size, weight = 'regular') => {
  const str = String(text == null ? '' : text)
  if (!ready) return str.length * size * 0.55
  const key = weight + '|' + size + '|' + str
  if (widths[key] == null) {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d')
    ctx.font = `${size}px measure-${weight}, sans-serif`
    widths[key] = ctx.measureText(str).width
  }
  return widths[key]
}

// CSS's wrap: break at spaces, keep a word that's wider than the line whole, honor newlines.
// runs are [{ text, size, weight, color }]. Returns lines of segments { text, x, size, weight, color }.
// measure(text, size, weight) gives a width, Roboto's unless the text is set in another face.
const wrapRuns =(runs, maxW, measure = robotoWidth) => {
  const lines = [[]]
  let used = 0
  const push = (word, run) => {
    const line = lines[lines.length - 1]
    const last = line[line.length - 1]
    const w = measure(word, run.size, run.weight)
    if (last && last.run === run) {
      last.text += word
      last.w += w
    } else line.push({ run, text: word, x: used, w })
    used += w
  }
  runs.forEach((run) => {
    String(run.text).split(/(\n| +)/).forEach((part) => {
      if (!part) return
      if (part === '\n') {
        lines.push([])
        used = 0
        return
      }
      if (part[0] === ' ') {
        if (lines[lines.length - 1].length) push(' ', run)
        return
      }
      const w = measure(part, run.size, run.weight)
      if (used > 0 && used + w > maxW) {
        const line = lines[lines.length - 1]
        // The space the break replaced goes with it.
        const tail = line[line.length - 1]
        if (tail && / $/.test(tail.text)) {
          tail.text = tail.text.replace(/ $/, '')
          tail.w -= measure(' ', tail.run.size, tail.run.weight)
        }
        lines.push([])
        used = 0
      }
      push(part, run)
    })
  })
  return lines.map((line) => line.map((s) => ({ text: s.text, x: s.x, w: s.w, size: s.run.size, weight: s.run.weight, color: s.run.color })))
}

export const wrapText = (text, size, weight, maxW, measure) =>
  wrapRuns([{ text: String(text || ''), size, weight }], maxW, measure).map((line) => line.map((s) => s.text).join(''))

// The inline nodes of a block as runs in its base style.
const runsOf = (nodes, base, accent, out = []) => {
  nodes.forEach((node) => {
    if (node.type === 'strong') runsOf(node.children, { ...base, weight: 'bold', color: base.strongColor }, accent, out)
    else if (node.type === 'em') runsOf(node.children, base, accent, out)
    else if (node.type === 'link') runsOf(node.children, { ...base, color: accent || base.color }, accent, out)
    else if (node.type === 'code') out.push({ ...base, text: node.text, size: dp(12) })
    else out.push({ ...base, text: node.text })
  })
  return out
}

// t: the theme tokens. links: the color links take, or null to leave them as text (release notes).
export const layoutBlocks = (blocks, width, t, links) => {
  const texts = []
  const rects = []
  const size = dp(13)
  const lh = size * 1.35
  const muted = t.os(0.75)
  const strong = t.onSurface
  const base = { size, weight: 'regular', color: muted, strongColor: strong }
  let y = 0
  let n = 0
  const place = (lines, x, top, lineH) => {
    lines.forEach((line, i) => {
      line.forEach((s) => {
        texts.push({
          k: `t${n++}`, t: s.text, x: x + s.x, y: top + i * lineH + robotoShift(s.size), size: s.size, lh: lineH,
          font: roboto(s.weight, s.text), color: s.color,
        })
      })
    })
    return lines.length * lineH
  }
  ;(blocks || []).forEach((block, bi) => {
    if (bi > 0) y += dp(6)
    if (block.type === 'heading') {
      const hs = dp(block.level <= 1 ? 17 : block.level === 2 ? 15 : 14)
      const runs = runsOf(block.children, { ...base, size: hs, weight: 'bold', color: strong, strongColor: strong }, links)
      y += place(wrapRuns(runs, width), 0, y, hs * 1.35)
    } else if (block.type === 'list') {
      const indent = dp(24)
      block.items.forEach((item, i) => {
        // Chrome draws a disc as a dot 0.3em across, centered 0.75em before the text and 0.7em down.
        if (block.ordered) {
          const marker = `${i + 1}. `
          texts.push({ k: `t${n++}`, t: marker, x: indent - robotoWidth(marker, size), y: y + robotoShift(size), size, lh, font: roboto(), color: muted })
        } else {
          const d = 0.3 * size
          rects.push({ k: `r${n++}`, x: indent - 0.75 * size - d / 2, y: y + 0.705 * size - d / 2, w: d, h: d, r: d / 2, color: muted })
        }
        y += place(wrapRuns(runsOf(item, base, links), width - indent), indent, y, lh)
      })
    } else if (block.type === 'quote') {
      const top = y
      y += place(wrapRuns(runsOf(block.children, base, links), width - dp(10) - 5), dp(10) + 5, y, lh)
      rects.push({ k: `r${n++}`, x: 0, y: top, w: 5, h: y - top, r: 0, color: t.os(0.25) })
    } else if (block.type === 'code') {
      const pad = dp(8)
      const cs = dp(12)
      const lines = wrapRuns([{ ...base, text: block.text, size: cs }], width - 2 * pad)
      const h = lines.length * cs * 1.35 + 2 * pad
      rects.push({ k: `r${n++}`, x: 0, y, w: width, h, r: dp(6), color: t.os(0.07) })
      place(lines, pad, y + pad, cs * 1.35)
      y += h
    } else {
      y += place(wrapRuns(runsOf(block.children, base, links), width), 0, y, lh)
    }
  })
  return { h: y, texts, rects }
}
