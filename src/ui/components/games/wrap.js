import { measure } from '../party/measure.js'

// How many lines a paragraph wraps to at a width, breaking between words, for laying out the text
// that follows it.
export const lineCount = (text, size, weight, maxW, measureFn = measure) => {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const space = measureFn(' ', size, weight)
  let lines = 1
  let used = 0
  words.forEach((word) => {
    const w = measureFn(word, size, weight)
    if (used && used + space + w > maxW) {
      lines++
      used = w
    } else used += (used ? space : 0) + w
  })
  return lines
}
