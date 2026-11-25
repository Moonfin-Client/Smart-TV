// The DOM the EPUB and PDF readers draw over the canvas: their stylesheet, a tiny element builder,
// and a focus walk for the reader menus.
import { assetUrl } from '../../../utils/assetUrl.js'

// These colors stay the same on every theme, apart from the track rows, which take `accent`,
// `accentA30` and `onSurface` from it.
export const readerCss = ({ accent, accentA30, onSurface }) => `
@font-face{font-family:'BookReaderRoboto';font-weight:400;src:url(${assetUrl('fonts/Roboto-Regular.ttf')})}
@font-face{font-family:'BookReaderRoboto';font-weight:500;src:url(${assetUrl('fonts/Roboto-Medium.ttf')})}
@font-face{font-family:'BookReaderRoboto';font-weight:700;src:url(${assetUrl('fonts/Roboto-Bold.ttf')})}
.brv{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99998;background:#000;overflow:hidden;font-family:BookReaderRoboto,Roboto,sans-serif;font-size:30px;line-height:33px;color:#fff}
.brv-reader{background:#101010}
.brv-imageContainer{width:100%;height:100%;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center}
.brv-inverted{-webkit-filter:invert(1);filter:invert(1)}
.brv-pdfPage{background:#fff}
.brv-loading{position:absolute;top:50%;left:50%;-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%)}
.brv-spinner{width:48px;height:48px;border:4px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;-webkit-animation:brvSpin 0.8s linear infinite;animation:brvSpin 0.8s linear infinite}
@-webkit-keyframes brvSpin{to{-webkit-transform:rotate(360deg)}}
@keyframes brvSpin{to{transform:rotate(360deg)}}
.brv-loadingContainer{width:100%;height:100%;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center}
.brv-loadingContainer>*+*{margin-top:20px}
.brv-loadingText{color:rgba(255,255,255,0.6);font-size:24px}
.brv-errorText{color:#ff6b6b;font-size:28px}
.brv-infoOverlay{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;opacity:0;-webkit-transition:opacity 0.3s ease;transition:opacity 0.3s ease}
.brv-infoVisible{opacity:1}
.brv-topBar{position:absolute;top:0;left:0;right:0;padding:24px 36px;background:-webkit-linear-gradient(top,rgba(0,0,0,0.7) 0%,transparent 100%);background:linear-gradient(to bottom,rgba(0,0,0,0.7) 0%,transparent 100%)}
.brv-title{color:#fff;font-size:32px;font-weight:600;text-shadow:0 2px 4px rgba(0,0,0,0.5)}
.brv-bottomBar{position:absolute;bottom:0;left:0;right:0;padding:24px 36px;background:-webkit-linear-gradient(bottom,rgba(0,0,0,0.7) 0%,transparent 100%);background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%);display:-webkit-flex;display:flex;-webkit-justify-content:space-between;justify-content:space-between;-webkit-align-items:flex-end;align-items:flex-end}
.brv-pageCounter{color:#fff;font-size:28px;font-weight:600;text-shadow:0 2px 4px rgba(0,0,0,0.5)}
.brv-navHint{color:rgba(255,255,255,0.5);font-size:20px}
.brv-frame{position:absolute;top:0;left:0;right:0;bottom:0;margin:0 auto;padding:5vh 0;box-sizing:border-box}
.brv-pages{width:100%;height:100%}
.brv-cover{position:absolute;top:0;left:0;right:0;bottom:0;background:#101010}
.brv-pdfCover{position:absolute;top:0;left:0;right:0;bottom:0;background:#000}
.brv-tint{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none}
.brv-chrome{position:absolute;top:0;left:0;right:0;bottom:0}
.brv-chromeTop{position:absolute;top:0;left:0;right:0;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;padding:24px 36px 48px;background:-webkit-linear-gradient(top,rgba(0,0,0,0.85) 0%,transparent 100%);background:linear-gradient(to bottom,rgba(0,0,0,0.85) 0%,transparent 100%)}
.brv-chromeTitle{-webkit-flex:1;flex:1;min-width:0;color:#fff;font-size:32px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brv-chromeButton{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;margin-left:16px;padding:10px 22px;border:2px solid transparent;border-radius:999px;background:rgba(255,255,255,0.12);color:#fff;font-size:22px;font-weight:600;outline:none}
.brv-chromeButton svg{width:28px;height:28px;margin-right:10px;fill:currentColor}
.brv-chromeButton:focus{background:#fff;color:#000}
.brv-chromeMark{margin-right:10px}
.brv-chromeBottom{position:absolute;left:0;right:0;bottom:0;padding:48px 36px 32px;background:-webkit-linear-gradient(bottom,rgba(0,0,0,0.85) 0%,transparent 100%);background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%)}
.brv-scrubber{padding:14px 0;border-radius:8px;outline:none}
.brv-scrubber:focus .brv-track{background:rgba(255,255,255,0.4)}
.brv-scrubber:focus .brv-thumb{-webkit-transform:scale(1.5);transform:scale(1.5)}
.brv-track{position:relative;height:8px;border-radius:4px;background:rgba(255,255,255,0.25)}
.brv-fill{position:absolute;top:0;bottom:0;left:0;border-radius:4px;background:#00a4dc}
.brv-thumb{position:absolute;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#fff;-webkit-transition:-webkit-transform 0.12s ease;transition:transform 0.12s ease}
.brv-scrubLabel{display:-webkit-flex;display:flex;-webkit-justify-content:space-between;justify-content:space-between;margin-top:10px;color:rgba(255,255,255,0.85);font-size:22px}
.brv-panel{position:absolute;top:0;right:0;bottom:0;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;width:760px;padding:32px;box-sizing:border-box;background:#121418;border-left:1px solid rgba(255,255,255,0.12)}
.brv-panelTitle{margin:0 0 20px;padding:0 8px;color:#fff;font-size:28px;font-weight:700}
.brv-tabs{display:-webkit-flex;display:flex;margin-bottom:16px;padding:0 8px}
.brv-list{-webkit-flex:1;flex:1;min-height:0;overflow-y:auto;padding:4px 8px}
.brv-list::-webkit-scrollbar{display:none}
.brv-empty{padding:16px 8px;color:rgba(255,255,255,0.6);font-size:22px}
.brv-choice{margin:0 12px 12px 0;padding:10px 20px;line-height:30.8px;border:2px solid transparent;border-radius:999px;background:rgba(255,255,255,0.08);color:#fff;font-size:22px;outline:none}
.brv-choice:focus{border-color:#fff}
.brv-choiceOn{background:#00a4dc}
.brv-swatch{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;width:64px;height:64px;padding:0;box-sizing:border-box;border:3px solid rgba(255,255,255,0.2);border-radius:50%;font-size:22px;font-weight:600}
.brv-swatch:focus{border-color:#fff;-webkit-transform:scale(1.08);transform:scale(1.08)}
.brv-swatch.brv-choiceOn{box-shadow:0 0 0 3px #00a4dc}
.brv-settingRow{margin-bottom:12px}
.brv-settingLabel{margin-bottom:10px;color:rgba(255,255,255,0.55);font-size:16px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase}
.brv-settingChoices{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-align-items:center;align-items:center}
.brv-stepValue{min-width:90px;margin:0 12px 12px 0;color:#fff;font-size:22px;text-align:center}
.brv-trackOption{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;width:100%;box-sizing:border-box;padding:21px 36px;background:transparent;border:none;border-radius:0;text-align:left;outline:none;-webkit-transition:background 0.15s ease-out;transition:background 0.15s ease-out}
.brv-trackOption:focus{background:${accentA30}}
.brv-trackIndicator{width:30px;height:30px;-webkit-flex-shrink:0;flex-shrink:0;margin-right:18px;color:rgba(255,255,255,0.55)}
.brv-trackOption.brv-selected .brv-trackIndicator{color:${accent}}
.brv-trackText{-webkit-flex:1;flex:1;min-width:0;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:flex-start;align-items:flex-start;overflow:hidden}
.brv-trackName{font-size:24px;line-height:30px;font-weight:600;color:${onSurface};white-space:nowrap;overflow:hidden;max-width:100%}
.brv-trackInfo{font-size:20px;line-height:28px;color:rgba(255,255,255,0.7);white-space:nowrap}
`

// One element: `cls` is a class or list, `props` sets attributes, styles (style: {}) and handlers.
export const h = (tag, cls, props, children) => {
  const node = document.createElement(tag)
  if (cls) node.className = [].concat(cls).filter(Boolean).join(' ')
  const p = props || {}
  Object.keys(p).forEach((key) => {
    const value = p[key]
    if (value == null || value === false) return
    if (key === 'style') Object.keys(value).forEach((s) => (node.style[s] = value[s]))
    else if (key === 'text') node.textContent = value
    else if (key.indexOf('on') === 0) node['_' + key] = value
    else node.setAttribute(key, value === true ? 'true' : value)
  })
  ;[].concat(children || []).forEach((child) => {
    if (child == null || child === false) return
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  })
  return node
}

export const svgIcon = (d, cls) => {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  if (cls) svg.setAttribute('class', cls)
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', d)
  if (cls) path.setAttribute('fill', 'currentColor')
  svg.appendChild(path)
  return svg
}

// A focusable stop the remote walks to. `onEnter` runs on OK, `onKey(name)` sees the arrows
// first and returns true when it took one.
export const spot = (node, onEnter, onKey) => {
  node.setAttribute('tabindex', '-1')
  node.classList.add('brv-spot')
  node._onEnter = onEnter
  node._onKey = onKey
  return node
}

const center = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 })

// The stop an arrow moves to: the nearest one lying the way it points, with the sideways distance
// weighed heavier so a move stays in its row or column.
export const nextSpot = (from, stops, direction) => {
  const a = from.getBoundingClientRect()
  const ca = center(a)
  let best = null
  let bestScore = Infinity
  stops.forEach((node) => {
    if (node === from) return
    const b = node.getBoundingClientRect()
    if (!b.width && !b.height) return
    const cb = center(b)
    let primary
    let side
    if (direction === 'left') {
      if (b.right > a.left + 1 && cb.x >= ca.x) return
      primary = Math.max(0, a.left - b.right)
      side = Math.abs(cb.y - ca.y)
    } else if (direction === 'right') {
      if (b.left < a.right - 1 && cb.x <= ca.x) return
      primary = Math.max(0, b.left - a.right)
      side = Math.abs(cb.y - ca.y)
    } else if (direction === 'up') {
      if (b.bottom > a.top + 1 && cb.y >= ca.y) return
      primary = Math.max(0, a.top - b.bottom)
      side = Math.abs(cb.x - ca.x)
    } else {
      if (b.top < a.bottom - 1 && cb.y <= ca.y) return
      primary = Math.max(0, b.top - a.bottom)
      side = Math.abs(cb.x - ca.x)
    }
    const score = primary + side * 2
    if (score < bestScore) {
      bestScore = score
      best = node
    }
  })
  return best
}

// The comic viewer's page pictures, kept here with the rest of the reader's browser APIs.
export const blobUrl = (blob) => URL.createObjectURL(blob)
// A comic page's drawn size: its own, shrunk to fit the screen but never enlarged.
export const fitPage = (w, h) => {
  const scale = Math.min(1, 1920 / w, 1080 / h)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}
export const dropUrl = (url) => {
  if (url) URL.revokeObjectURL(url)
}
// A page turned negative. It's drawn at no more than screen size so the TV does as little as it
// can, and goes through a 2D canvas once since the renderer has no invert.
export const invertedUrl = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1920 / img.width, 1080 / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'difference'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = reject
    img.src = url
  })
