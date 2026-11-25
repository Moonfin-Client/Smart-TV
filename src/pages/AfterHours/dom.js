// The arcade draws in the DOM above the app's canvas. Its games paint a 2D canvas every frame,
// which the browser composites far cheaper than the renderer could take it as a texture.
import arcadeCss from './arcadeCss.js'
import { legacy } from '../../ui/tier.js'
import { assetUrl } from '../../utils/assetUrl.js'

let styled = false

const ensureStyles = () => {
  if (styled || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = arcadeCss.replace(/url\('([^']+)'\)/g, (m, path) => `url('${assetUrl(path)}')`)
  document.head.appendChild(style)
  styled = true
}

// Server text (user names, library titles) goes into markup, so it's escaped on the way.
export const esc = (value) =>
  String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

// A layer laid out on the 1920 by 1080 stage and scaled to the window the way the canvas is.
export const mountLayer = (className) => {
  ensureStyles()
  const el = document.createElement('div')
  el.className = className + (legacy ? ' ah-perf-low' : '')
  el.style.fontFamily = "'ah-roboto', sans-serif"
  const scale = window.innerWidth / 1920
  if (Math.abs(scale - 1) > 0.001) {
    el.style.width = '1920px'
    el.style.height = '1080px'
    el.style.transformOrigin = '0 0'
    el.style.transform = `scale(${scale})`
  }
  document.body.appendChild(el)
  return el
}
