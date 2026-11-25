// Runs fn once the renderer has drawn its next frame, for work that can wait until a page is back on
// screen. The renderer's frameTick comes at the start of each frame, and a timer set there runs
// after that frame is drawn. With nothing to draw no frame may come, so fn runs after `ms` anyway.
// Returns a cancel.
export const afterDraw = (renderer, fn, ms = 100) => {
  let timer = null
  const tick = () => {
    renderer.off('frameTick', tick)
    clearTimeout(timer)
    timer = setTimeout(fn, 0)
  }
  renderer.on('frameTick', tick)
  timer = setTimeout(() => {
    renderer.off('frameTick', tick)
    fn()
  }, ms)
  return () => {
    renderer.off('frameTick', tick)
    clearTimeout(timer)
  }
}
