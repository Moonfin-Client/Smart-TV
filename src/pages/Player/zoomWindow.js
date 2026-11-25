// The zoom window handed to the TV: the part of the decoded frame to show and where on the panel,
// in the panel's own pixels. Only webOS 3 to 5 act on it, for Stretch.
import { getZoomDisplayRect, matchDecodedOrientation } from './aspectRatioUtils.js'

// The panel's size, which on a 4K set is bigger than the page's.
export const panelRect = (win) => {
  const cssW = Math.max(1, Math.round(win.innerWidth || 1920))
  const cssH = Math.max(1, Math.round(win.innerHeight || 1080))
  const dpr = Math.max(1, win.devicePixelRatio || 1)
  const screen = win.screen || {}
  return {
    width: Math.max(Math.round(screen.width || cssW * dpr), Math.round(cssW * dpr)),
    height: Math.max(Math.round(screen.height || cssH * dpr), Math.round(cssH * dpr)),
  }
}

export const zoomWindow = ({ screen, zoom, declared, decoded, videoWidth, videoHeight }) => {
  const decodedAspect = decoded > 0 ? decoded : null
  const target = declared > 0 ? matchDecodedOrientation(declared, decodedAspect) : decodedAspect
  const dest = getZoomDisplayRect(screen, target, zoom)
  const srcW = Math.max(1, Math.round(videoWidth || screen.width))
  const srcH = Math.max(1, Math.round(videoHeight || screen.height))
  const correction = decodedAspect && target ? target / decodedAspect : 1
  let x = 0
  let y = 0
  let w = srcW
  let h = srcH
  if (zoom === 'fill' && decodedAspect && target) {
    const screenAspect = screen.width / screen.height
    const correctedW = srcW * correction
    const correctedAspect = correctedW / srcH
    if (correctedAspect > screenAspect) {
      const wanted = srcH * screenAspect
      x = Math.max(0, Math.round((correctedW - wanted) / 2 / correction))
      w = Math.max(1, Math.round(wanted / correction))
    } else if (correctedAspect < screenAspect) {
      const wanted = correctedW / screenAspect
      y = Math.max(0, Math.round((srcH - wanted) / 2))
      h = Math.max(1, Math.round(wanted))
    }
  }
  return { x, y, width: w, height: h, destX: dest.x, destY: dest.y, destWidth: dest.width, destHeight: dest.height, mode: zoom }
}
