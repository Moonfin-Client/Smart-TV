// What the details pieces ask of the browser, kept out of the components.

// Whether the browser can blur what's behind an element (backdrop-filter). webOS 3's Chrome 38
// can't, so the glass circles stay clear there.
export const BACKDROP_BLUR =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))

// Whether the browser scrolls smoothly (scroll-behavior). Pages animate their scroll only where it
// does, since older Tizen and webOS jump instead.
export const SMOOTH_SCROLL = typeof document !== 'undefined' && 'scrollBehavior' in document.documentElement.style

// Whether the app is behind another app or input, when Seerr's status poll waits.
export const appHidden = () => typeof document !== 'undefined' && !!document.hidden
