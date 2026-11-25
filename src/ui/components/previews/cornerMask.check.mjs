// The corner mask rewrites two lines of the renderer's HolePunch shader. Fails if either moved.
import assert from 'node:assert/strict'
import { HolePunch } from '@solidtv/renderer/webgl/shaders'
import { maskFragment } from './cornerMask.js'

const src = HolePunch.fragment({ stage: { pixelRatio: 1 } })
const out = maskFragment(src)
assert.ok(src.indexOf('- r + 2.0;') >= 0, 'HolePunch no longer insets its hole by 2px')
assert.ok(src.indexOf('min(color.a, roundedAlpha)') >= 0, 'HolePunch no longer mixes by the fill alpha')
assert.ok(out.indexOf('- r + 2.0;') < 0 && out.indexOf('mix(color, vec4(0.0), roundedAlpha)') >= 0)
console.log('cornerMask ok')
