// Transition settings that keep their identity. Solid runs all of an element's dynamic props in one
// effect, so a `transition={{...}}` literal that reads a signal is rebuilt whenever any of them
// changes, and the renderer reuses a prop's running animation only when it gets the same settings
// object back (a new one replaces it, scripts/patch-renderer.mjs). Each timing here is one object,
// shared by every transition that uses it. A prop with no duration gets no transition, so an
// instant move writes straight through (and stops any animation still running on that prop).
const ones = {}
const sets = {}
const one = (duration, easing) => {
  const k = duration + '|' + (easing || '')
  return ones[k] || (ones[k] = easing ? { duration, easing } : { duration })
}

// `fx('x,width', ms, easing)`: those props on one timing.
export const fx = (props, duration, easing) => {
  if (!duration) return undefined
  const k = props + '#' + duration + '|' + (easing || '')
  let out = sets[k]
  if (!out) {
    const s = one(duration, easing)
    out = sets[k] = {}
    props.split(',').forEach((p) => (out[p] = s))
  }
  return out
}

// `tx({ y: { duration, easing }, alpha: ... })`: any transition object, kept by what it holds.
export const tx = (spec) => {
  if (!spec) return undefined
  let k = ''
  for (const p in spec) {
    const s = spec[p]
    if (s && s.duration) k += p + '#' + s.duration + '|' + (s.easing || '') + ';'
  }
  if (!k) return undefined
  let out = sets[k]
  if (!out) {
    out = sets[k] = {}
    for (const p in spec) {
      const s = spec[p]
      if (s && s.duration) out[p] = one(s.duration, s.easing)
    }
  }
  return out
}

export const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)'
