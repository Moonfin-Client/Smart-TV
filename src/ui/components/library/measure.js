// Text widths before the renderer draws, so the library chrome can lay itself out. ui/text.js does
// the measuring with the same Roboto files the renderer draws with.
import { textReady, textWidth as measured } from '../../text.js'

// Resolves once the faces are in, so a layout worked out after it uses real widths.
export const fontsReady = () => textReady()

export const textWidth = (text, size, weight = 'regular', spacing = 0) => {
  const str = String(text == null ? '' : text)
  return measured(str, size, weight) + spacing * str.length
}

// Cuts on characters, not whole words.
export const fitText = (text, size, weight, maxW) => {
  const str = String(text == null ? '' : text)
  if (!str || textWidth(str, size, weight) <= maxW) return str
  const dots = '…'
  const room = maxW - textWidth(dots, size, weight)
  let lo = 0
  let hi = str.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (textWidth(str.slice(0, mid), size, weight) <= room) lo = mid
    else hi = mid - 1
  }
  return str.slice(0, lo).replace(/\s+$/, '') + dots
}
