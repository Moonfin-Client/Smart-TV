import { getPerfTier } from '../utils/perfTier.js'

// What the device can afford. Chrome 38 to 49 (webOS 3, old Tizen) has no createImageBitmap
// and runs the ES5 bundle, so it gets the legacy image path and fewer animations.
export const legacy = typeof createImageBitmap !== 'function'

// The performance tier (utils/perfTier.js): 'low' below Chrome 56, 'mid' below 85, 'high' from
// there, or the Performance Mode setting when it names one. Effects that drop on the low and mid
// tiers gate on this.
export const perfTier = getPerfTier

// A transition's duration on the high tier, else 0 (instant).
export const highMs = (ms) => (perfTier() === 'high' ? ms : 0)

export const tier = { legacy }
