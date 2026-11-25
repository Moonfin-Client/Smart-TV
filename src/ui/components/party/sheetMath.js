// Layout help for the Watch Party screens: text that wraps across two styles in one line box, and scrolling a control
// into view. Pure, so sheetMath.check.mjs runs it under node.

// Words of several runs (each {text, style}) laid out left to right and wrapped at `maxW`, as inline spans wrap.
// Returns lines of segments {text, style, x}, where a segment is one run's words on one line.
export const flowText = (runs, maxW, measure) => {
  const lines = [[]]
  let x = 0
  runs.forEach((run) => {
    const words = String(run.text).split(/( +)/).filter((w) => w !== '')
    words.forEach((word) => {
      const w = measure(word, run.style)
      const space = /^ +$/.test(word)
      if (!space && x > 0 && x + w > maxW) {
        lines.push([])
        x = 0
      }
      if (space && x === 0) return
      const line = lines[lines.length - 1]
      const last = line[line.length - 1]
      if (last && last.style === run.style) {
        last.text += word
      } else {
        line.push({ text: word, style: run.style, x })
      }
      x += w
    })
  })
  lines.forEach((line) => {
    const last = line[line.length - 1]
    if (last) last.text = last.text.replace(/ +$/, '')
  })
  return lines.filter((l) => l.length)
}

// The scroll that brings a rect into a view of height `viewH`, moving no further than needed, as focus() does.
export const scrollFor = (scroll, rect, viewH, contentH) => {
  let next = scroll
  if (rect.y < next) next = rect.y
  else if (rect.y + rect.h > next + viewH) next = rect.y + rect.h - viewH
  return Math.max(0, Math.min(next, Math.max(0, contentH - viewH)))
}
