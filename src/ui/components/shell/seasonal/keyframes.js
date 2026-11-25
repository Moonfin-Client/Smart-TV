// The seasonal keyframes, and a sampler that plays them the way CSS does: each property between the
// keyframes that set it, eased by the timing function of the keyframe it leaves. x and y are in vw,
// vh or px, r in degrees, s and sy are scaleY, sc is scale and o is opacity.

// The CSS cubic-bezier, solved for x by Newton's method with a bisection fallback.
const bezier = (x1, y1, x2, y2) => {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (t) => ((ax * t + bx) * t + cx) * t
  const sy = (t) => ((ay * t + by) * t + cy) * t
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x
      if (Math.abs(err) < 1e-6) return sy(t)
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    let lo = 0
    let hi = 1
    t = x
    while (hi - lo > 1e-6) {
      if (sx(t) < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sy(t)
  }
}

export const EASE = {
  linear: (u) => u,
  ease: bezier(0.25, 0.1, 0.25, 1),
  easeIn: bezier(0.42, 0, 1, 1),
  easeOut: bezier(0, 0, 0.58, 1),
  easeInOut: bezier(0.42, 0, 0.58, 1),
  stepEnd: (u) => (u >= 1 ? 1 : 0),
  rocket: bezier(0.2, 0.6, 0.35, 1),
  glide: bezier(0.33, 1, 0.68, 1),
}

const rnd = (v, places = 0) => Number(v.toFixed(places))

// A keyframes block: [[percent, {prop: value}, easing?], ...], easing defaulting to the
// element's. Returns {prop: [[at, value, ease], ...]} with at from 0 to 1.
const tracks = (frames, ease = EASE.linear) => {
  const out = {}
  frames.forEach(([pct, values, e]) => {
    Object.keys(values).forEach((p) => {
      ;(out[p] = out[p] || []).push([pct / 100, values[p], e || ease])
    })
  })
  return out
}

const range = (n) => {
  const list = []
  for (let i = 0; i <= n; i++) list.push(i)
  return list
}

// A fall from above the screen to below it (or a rise the other way), drifting across and swaying
// `cycles` times, with an optional swing, spin and flips.
const fall = (drift, amp, cycles, swing, spin, flips, steps, rise = false) =>
  tracks(
    range(steps).map((i) => {
      const t = i / steps
      const phase = t * cycles * 2 * Math.PI
      const v = {
        x: rnd(drift * t + amp * Math.sin(phase), 2),
        y: rise ? rnd(112 - 124 * t, 2) : rnd(-12 + 124 * t, 2),
      }
      if (swing !== 0 || spin !== 0) v.r = rnd(swing * Math.cos(phase) + spin * t, 1)
      if (flips > 0) v.s = rnd(0.12 + 0.88 * Math.abs(Math.cos(t * flips * Math.PI)), 2)
      return [rnd(t * 100, 2), v]
    })
  )

// A firefly's loop around its spot, pulsing `pulses` times.
const wander = (ax, ay, phase, pulses) =>
  tracks(
    range(24).map((i) => {
      const t = i / 24
      const a = t * 2 * Math.PI
      const pulse = Math.sin(t * pulses * Math.PI)
      return [
        rnd(t * 100, 2),
        {
          o: rnd(0.15 + 0.85 * pulse * pulse, 2),
          x: rnd(ax * Math.sin(a) + 0.3 * ax * Math.sin(3 * a + phase), 2),
          y: rnd(ay * Math.sin(2 * a + phase), 2),
        },
      ]
    })
  )

// A flyer crossing the screen from `from` to `to`, bobbing `bobs` times.
const flight = (from, to, bob, bobs) =>
  tracks(
    range(20).map((i) => {
      const t = i / 20
      return [rnd(t * 100, 2), { x: rnd(from + (to - from) * t, 2), y: rnd(bob * Math.sin(t * bobs * 2 * Math.PI), 2) }]
    })
  )

const move = (spots) =>
  tracks(spots.map(([x, y], i) => [i * 20, { x, y }]).concat([[100, { x: spots[4][0], y: spots[4][1] }]]), EASE.stepEnd)

// A swing that dies away, rotation only.
const damped = (amp, swings) =>
  tracks(
    range(16).map((i) => {
      const t = i / 16
      return [rnd(t * 100, 2), { r: rnd(amp * Math.sin(t * swings * 2 * Math.PI) * (1 - t) * (1 - t), 1) }]
    })
  )

const ringStops = () => {
  const frames = [
    [0, { o: 0, y: 0, sc: 0.05 }],
    [40, { o: 0, y: 0, sc: 0.05 }],
  ]
  for (let i = 1; i <= 12; i++) {
    const u = i / 12
    frames.push([
      rnd(40 + 60 * u, 2),
      { o: u <= 0.5 ? 1 : rnd((1 - u) * 2, 3), y: rnd(9 * u * u, 3), sc: rnd(0.05 + 0.95 * (1 - Math.pow(1 - u, 3)), 3) },
    ])
  }
  return tracks(frames)
}

export const KEYFRAMES = {
  snow0: fall(-4, 0.6, 3, 0, 40, 0, 12),
  snow1: fall(-4, 1.1, 3, 0, -40, 0, 12),
  snow2: fall(4, 0.6, 3, 0, -40, 0, 12),
  snow3: fall(4, 1.1, 3, 0, 40, 0, 12),
  leaves0: fall(-6, 2.4, 3, 38, 0, 0, 18),
  leaves1: fall(-6, -2.4, 3, -38, 0, 0, 18),
  leaves2: fall(6, 2.4, 3, 38, 0, 0, 18),
  leaves3: fall(6, -2.4, 3, -38, 0, 0, 18),
  confetti0: fall(-6, 1, 2, 0, 720, 8, 36),
  confetti1: fall(-6, 1, 2, 0, -720, 7, 36),
  confetti2: fall(6, 1, 2, 0, 720, 7, 36),
  confetti3: fall(6, 1, 2, 0, -720, 8, 36),
  petals0: fall(-6, 1.8, 3, 22, 0, 2, 24),
  petals1: fall(-6, -1.8, 3, -22, 0, 3, 24),
  petals2: fall(6, 1.8, 3, 22, 0, 3, 24),
  petals3: fall(6, -1.8, 3, -22, 0, 2, 24),
  rise0: fall(-3, 1, 3, 7, 0, 0, 18, true),
  rise1: fall(-3, -1.4, 2, -7, 0, 0, 18, true),
  rise2: fall(3, 1, 3, 7, 0, 0, 18, true),
  rise3: fall(3, -1.4, 2, -7, 0, 0, 18, true),
  flicker: tracks([[0, { o: 0.3 }], [100, { o: 1 }]], EASE.easeInOut),
  twinkle: tracks([[0, { o: 0.4 }], [100, { o: 1 }]], EASE.easeInOut),
  fireflies0: wander(3, 2, 0, 3),
  fireflies1: wander(-2.5, 2.5, 1.2, 4),
  fireflies2: wander(4, 1.5, 2.4, 3),
  fireflies3: wander(-3.5, 2, 3.6, 5),
  flyRight0: flight(-10, 110, 2.5, 4),
  flyRight1: flight(-10, 110, 4, 3),
  flyLeft0: flight(110, -10, 3, 5),
  flyLeft1: flight(110, -10, 2, 3),
  beeBuzzRight: tracks([[0, { y: -0.35, r: 84 }], [100, { y: 0.35, r: 96 }]]),
  beeBuzzLeft: tracks([[0, { y: -0.35, r: -96 }], [100, { y: 0.35, r: -84 }]]),
  ghostFloat: tracks([[0, { y: -1.2, r: -4 }], [100, { y: 1.2, r: 4 }]], EASE.easeInOut),
  batFlap: tracks([[0, { sy: 1 }], [100, { sy: 0.35 }]], EASE.easeInOut),
  moveA: move([[22, 24], [66, 34], [38, 17], [80, 22], [50, 38]]),
  moveB: move([[72, 18], [28, 30], [58, 40], [16, 20], [84, 32]]),
  moveC: move([[46, 30], [14, 38], [86, 26], [34, 16], [62, 22]]),
  rocketRise: tracks(
    [
      [0, { o: 0, y: 72 }, EASE.rocket],
      [8, { o: 0, y: 72 }, EASE.rocket],
      [11, { o: 1 }],
      [36, { o: 1 }],
      [40, { o: 0, y: 0 }],
      [100, { o: 0, y: 0 }],
    ],
    EASE.ease
  ),
  burstFlash: tracks(
    [
      [0, { o: 0, sc: 0.5 }],
      [40, { o: 0, sc: 0.5 }],
      [42, { o: 0.45 }],
      [52, { o: 0, sc: 1 }],
      [100, { o: 0, sc: 1 }],
    ],
    EASE.easeOut
  ),
  burstRing: ringStops(),
  sparksCrackle: tracks(
    [
      [0, { o: 1, r: 0, sc: 1 }],
      [25, { o: 0.75, r: 97, sc: 0.82 }],
      [50, { o: 1, r: 203, sc: 1.08 }],
      [75, { o: 0.8, r: 291, sc: 0.9 }],
      [100, { o: 1, r: 360, sc: 1 }],
    ],
    EASE.stepEnd
  ),
  // skewX is drawn as a turn the other way about the same origin, which leans the flame alike.
  flameFlicker: tracks(
    [
      [0, { o: 1, sy: 1, r: 0 }],
      [20, { o: 0.9, sy: 1.08, r: 4 }],
      [45, { o: 1, sy: 0.93, r: -3 }],
      [70, { o: 0.92, sy: 1.05, r: 2 }],
      [100, { o: 1, sy: 1, r: 0 }],
    ],
    EASE.easeInOut
  ),
  glowPulse: tracks([[0, { o: 0.7, sc: 0.94 }], [100, { o: 1, sc: 1.06 }]], EASE.easeInOut),
  swingCw: damped(16, 2.5),
  swingCcw: damped(-16, 2.5),
  rockCw: damped(9, 2),
  rockCcw: damped(-9, 2),
  tiltCw: tracks([[0, { r: 0 }], [40, { r: 8 }], [100, { r: 0 }]], EASE.easeInOut),
  tiltCcw: tracks([[0, { r: 0 }], [40, { r: -8 }], [100, { r: 0 }]], EASE.easeInOut),
}

// One run of a swing, rock or tilt after a move, in seconds.
export const ONE_SHOT_SECONDS = { swingCw: 2.6, swingCcw: 2.6, rockCw: 1.2, rockCcw: 1.2, tiltCw: 0.45, tiltCcw: 0.45 }

// A property's value at progress p (0 to 1) through one iteration.
export const sample = (track, p) => {
  let k = 0
  while (k < track.length - 2 && p >= track[k + 1][0]) k++
  const [a0, v0, ease] = track[k]
  const [a1, v1] = track[k + 1]
  const u = a1 > a0 ? Math.min(1, Math.max(0, (p - a0) / (a1 - a0))) : 1
  return v0 + (v1 - v0) * ease(u)
}

// Progress through the current iteration of an animation `seconds` long that started `delay`
// seconds after the clock (negative starts it part way), at clock time `t`. `alternate` plays
// every other iteration backwards. Null once a one-shot run is over.
export const progress = (t, seconds, delay, alternate = false, once = false) => {
  const local = (t - delay) / seconds
  if (local < 0) return 0
  if (once && local >= 1) return null
  const iteration = Math.floor(local)
  const frac = local - iteration
  return alternate && iteration % 2 === 1 ? 1 - frac : frac
}

// Every property of a keyframes block at progress p, into `out`.
export const sampleAll = (name, p, out) => {
  const block = KEYFRAMES[name]
  for (const prop in block) out[prop] = sample(block[prop], p)
  return out
}
