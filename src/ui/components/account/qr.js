import { drawQrCode } from '../../../utils/qrCanvas.js'

// A link as a QR code image (a PNG data URL), or '' where there's no canvas.
export const qrDataUrl = (url) => {
  if (!url || typeof document === 'undefined') return ''
  try {
    const canvas = document.createElement('canvas')
    drawQrCode(canvas, url)
    return canvas.width ? canvas.toDataURL('image/png') : ''
  } catch (e) {
    return ''
  }
}
