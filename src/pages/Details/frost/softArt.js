import { getRenderer } from '@solidtv/solid'
import { Blur } from '@solidtv/renderer/webgl/shaders'

// Art the server can't blur (a Seerr title's TMDB backdrop) wants a 60px blur. TMDB's 45px wide copy
// stretched across the screen, through the renderer's 3x3 blur with its taps 80px (about two of
// those pixels) apart, comes out close to a 60px Gaussian.
// shortcut: a true Gaussian fades the picture out over its edges and this one runs to them, which
// the vignette mostly hides. Fade the edges if a bright picture shows it.
const TMDB = /\/t\/p\/(w\d+|original)\//

export const tmdbSoft = (url) => (url && /image\.tmdb\.org/.test(url) && TMDB.test(url) ? url.replace(TMDB, '/t/p/w45/') : '')

let registered = false

export const softBlur = () => {
  if (!registered) {
    getRenderer().stage.shManager.registerShaderType('frostBlur', Blur)
    registered = true
  }
  return ['frostBlur', { amount: 80 }]
}
