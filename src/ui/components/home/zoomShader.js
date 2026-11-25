import { getRenderer } from '@solidtv/solid'
import { Rounded } from '@solidtv/renderer/webgl/shaders'

// The rounded shader with its picture zoomed about the middle by a `zoom` prop, for art that pushes
// in inside a rounded frame (Aya's). This renderer has no rounded clip, and scaling the rounded node
// itself would push its corners out past the frame. The node keeps resizeMode cover, whose crop is
// centered, so the middle of the picture is the middle of its texture coordinates.
// Animate it with node.animate({ shaderProps: { zoom } }, settings).
const RoundedZoom = {
  ...Rounded,
  props: { ...Rounded.props, zoom: 1 },
  update(node) {
    Rounded.update.call(this, node)
    this.uniform1f('u_zoom', this.props.zoom)
  },
  fragment: (renderer) =>
    Rounded.fragment(renderer)
      .replace('uniform vec4 u_radius;', 'uniform vec4 u_radius;\n    uniform float u_zoom;')
      .replace('texture2D(u_texture, v_textureCoords)', 'texture2D(u_texture, 0.5 + (v_textureCoords - 0.5) / u_zoom)'),
}

let registered = false

// The shader's name, registered on first use (the renderer has to exist by then).
export const roundedZoom = () => {
  if (!registered) {
    getRenderer().stage.shManager.registerShaderType('roundedZoom', RoundedZoom)
    registered = true
  }
  return 'roundedZoom'
}
