// The animated screensaver backdrops: a gradient wider than the screen turning and breathing, a
// soft glow drifting over it, and for Neon Pulse a brighter copy of the gradient pulsing in. The
// keyframes are sampled the way CSS runs them with linear timing, straight lines between the
// listed steps.
import { scrimSrc } from '../../../../utils/scrimImage.js'
import { rgbTriplet } from '../../../themeColor.js'

// linear-gradient(to left, ...) starts at the right edge, so the stops run backwards from the left.
const toLeft = (colors) => [{ to: 'right', rgb: '0, 0, 0', stops: colors.slice().reverse().map((c, i) => [i / (colors.length - 1), 1, rgbTriplet(c)]) }]
// radial-gradient(circle closest-side, ...) over the whole screen.
const glow = (rgb, stops) => [{ at: [0.5, 0.5], radius: 0.5, rgb, stops }]

const PALETTES = {
  moonfin: {
    orbit: ['#1a0526', '#6b2087', '#aa5cc3', '#9c62c5', '#7672cb', '#3a8cd4', '#00c6ff', '#091426'],
    accent: glow('0, 198, 255', [[0, 0.58], [0.65, 0.1], [1, 0]]),
  },
  calm: {
    orbit: ['#071b0f', '#134223', '#1f6b38', '#2e8b57', '#48b369', '#68d388', '#287a43', '#0b2414'],
    accent: glow('104, 211, 136', [[0, 0.58], [0.65, 0.1], [1, 0]]),
  },
  aurora: {
    orbit: ['#02111c', '#04483e', '#00b894', '#00cec9', '#6c5ce7', '#1a0e3d'],
    accent: glow('0, 206, 201', [[0, 0.58], [0.65, 0.1], [1, 0]]),
  },
  neonPulse: {
    orbit: ['#080412', '#2b004e', '#c41264', '#9000d0', '#00b4d8', '#0b2742', '#05030d'],
    flash: ['#080412', '#2b004e', '#ff78bd', '#d466ff', '#7affff', '#0b2742', '#05030d'],
    accent: glow('255, 94, 171', [[0, 0.66], [0.65, 0.24], [1, 0]]),
  },
}

export const isGradientBackdrop = (backdrop) => !!PALETTES[backdrop]

// The baked images for a palette: orbit, accent and (Neon Pulse only) flash.
export const gradientImages = (backdrop) => {
  const p = PALETTES[backdrop]
  return {
    orbit: scrimSrc(toLeft(p.orbit)),
    accent: scrimSrc(p.accent),
    flash: p.flash ? scrimSrc(toLeft(p.flash)) : '',
  }
}

const ORBIT_MS = 18000
const DRIFT_MS = 36000
const PULSE_MS = 4500
const ORBIT_SCALE = [1.06, 1.102, 1.12, 1.102, 1.06, 1.018, 1, 1.018, 1.06]
const DRIFT_X = [0, 7.65, 14.14, 18.48, 20, 18.48, 14.14, 7.65, 0, -7.65, -14.14, -18.48, -20, -18.48, -14.14, -7.65, 0]
const DRIFT_Y = [16, 11.31, 0, -11.31, -16, -11.31, 0, 11.31, 16, 11.31, 0, -11.31, -16, -11.31, 0, 11.31, 16]
const DRIFT_SCALE = [1.225, 1.49, 1.6, 1.49, 1.225, 0.96, 0.85, 0.96, 1.225, 1.49, 1.6, 1.49, 1.225, 0.96, 0.85, 0.96, 1.225]
const BREATH = [0.81, 0.944, 1, 0.944, 0.81, 0.676, 0.621, 0.676, 0.81]
const NEON_ACCENT = [0.712, 0.916, 1, 0.916, 0.712, 0.509, 0.424, 0.509, 0.712]
const NEON_FLASH = [0.5, 0.854, 1, 0.854, 0.5, 0.146, 0, 0.146, 0.5]

// A keyframe list (evenly spaced from 0% to 100%) at `ms` into a loop of `period` ms.
export const sample = (list, ms, period) => {
  const pos = ((ms % period) / period) * (list.length - 1)
  const i = Math.floor(pos)
  const next = list[Math.min(i + 1, list.length - 1)]
  return list[i] + (next - list[i]) * (pos - i)
}

// Every animated value at `ms` since the gradient appeared. Translations are in px of the 1920x1080
// overlay and rotation in radians, as the renderer takes them.
export const gradientFrame = (backdrop, ms) => {
  const neon = backdrop === 'neonPulse'
  return {
    rotation: ((ms % ORBIT_MS) / ORBIT_MS) * Math.PI * 2,
    orbitScale: sample(ORBIT_SCALE, ms, ORBIT_MS),
    driftX: (sample(DRIFT_X, ms, DRIFT_MS) / 100) * 1920,
    driftY: (sample(DRIFT_Y, ms, DRIFT_MS) / 100) * 1080,
    driftScale: sample(DRIFT_SCALE, ms, DRIFT_MS),
    accent: neon ? sample(NEON_ACCENT, ms, PULSE_MS) : sample(BREATH, ms, ORBIT_MS),
    flash: neon ? sample(NEON_FLASH, ms, PULSE_MS) : 0,
  }
}
