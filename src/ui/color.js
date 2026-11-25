// Colors. A node's color props (color, colorTop, colorBottom, colorLeft, colorRight and the four
// corners) take theme() tokens as they are, '#rrggbbaa' strings: installColorProps() converts them
// on the way to the renderer, transitions included. Shader objects (border, shadow, gradients)
// get no such pass and need numbers, so wrap their colors in hex() (shadows want shadowColor()
// from ui/theme.js, which also premultiplies).
import { ElementNode } from '@solidtv/solid'
import { hex } from './themeColor.js'

export { hex }

const COLOR_PROPS = { color: 1, colorTop: 1, colorBottom: 1, colorLeft: 1, colorRight: 1, colorTl: 1, colorTr: 1, colorBl: 1, colorBr: 1 }

export const installColorProps = () => {
  const proto = ElementNode.prototype
  if (proto.__moonfinColors) return
  proto.__moonfinColors = true
  const send = proto._sendToLightningAnimatable
  proto._sendToLightningAnimatable = function (name, value) {
    return send.call(this, name, typeof value === 'string' && COLOR_PROPS[name] === 1 ? hex(value) : value)
  }
}
