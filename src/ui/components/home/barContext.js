import { createSignal } from 'solid-js'

// What barKit.js and trailerHost.js read and write on a bar: the slides, the root node (set
// `bar.root`), the release labels' version, focus, the trailer's holding and active states, and the
// carousel's timer. `hole` gives the rect Home keeps clear around a trailer that plays in a frame
// (Aya's), or nothing for a full screen one.
export const createBarContext = (props, hole) => {
  const [relVer, setRelVer] = createSignal(0)
  const [holding, setHolding] = createSignal(false)
  const [active, setActive] = createSignal(false)
  const bar = {
    root: null,
    _focused: false,
    get items() {
      return props.items || []
    },
    get node() {
      return bar.root
    },
    get relVer() {
      return relVer()
    },
    set relVer(v) {
      setRelVer(v)
    },
    get trailerHolding() {
      return holding()
    },
    set trailerHolding(v) {
      setHolding(v)
    },
    get trailerActive() {
      return active()
    },
    set trailerActive(v) {
      setActive(v)
    },
    onBarTrailer: (on) => props.onBarTrailer && props.onBarTrailer(on, on && hole ? hole() : null),
    $setInterval: (fn, ms) => setInterval(fn, ms),
    $clearInterval: (t) => clearInterval(t),
  }
  return { bar, relVer, holding, active }
}
