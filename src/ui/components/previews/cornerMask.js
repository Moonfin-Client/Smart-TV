import { getRenderer } from '@solidtv/solid'
import { HolePunch } from '@solidtv/renderer/webgl/shaders'

// A box's color with a rounded rectangle cut out of it, to lay over a picture that has to look
// rounded, like the settings stage, since this renderer has no rounded clip. The renderer's HolePunch
// leaves a see-through fill partly in the hole and draws the hole 2px small, so this cuts it whole
// at the size it's given.
export const maskFragment = (src) =>
  src.replace('- r + 2.0;', '- r;').replace('mix(color, vec4(0.0), min(color.a, roundedAlpha))', 'mix(color, vec4(0.0), roundedAlpha)')
const CornerMask = { ...HolePunch, fragment: (renderer) => maskFragment(HolePunch.fragment(renderer)) }

let registered = false

// The shader's name, registered on first use (the renderer has to exist by then). Its props are
// the hole's { x, y, w, h, radius } in the node's own units.
export const cornerMask = () => {
  if (!registered) {
    getRenderer().stage.shManager.registerShaderType('cornerMask', CornerMask)
    registered = true
  }
  return 'cornerMask'
}
