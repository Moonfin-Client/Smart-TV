// The canvas drawing of the loading animations (the spinner, the moon phases and the gradient
// label), run once per size and kept as images, since the renderer can't run a canvas per frame
// cheaply. The moon's phase is baked into MOON_FRAMES frames.
import { normalLine } from '../../../text.js'

const canvasOf = (w, h) => {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w)
  c.height = Math.ceil(h)
  return c
}
const cache = {}
const once = (key, make) => (cache[key] !== undefined ? cache[key] : (cache[key] = make()))

// The spinner's arc fades in from nothing to purple over its first stretch, then turns cyan
// toward the head. Past the head, the round end caps included, it stays cyan.
const SWEEP = Math.PI * 1.35
const PURPLE = [170, 92, 195]
const CYAN = [0, 164, 220]
const arcColor = (t) => {
  if (t > 1) return [CYAN[0], CYAN[1], CYAN[2], 1]
  if (t < 0.45) return [PURPLE[0], PURPLE[1], PURPLE[2], t / 0.45]
  const mix = (t - 0.45) / 0.55
  return [PURPLE[0] + (CYAN[0] - PURPLE[0]) * mix, PURPLE[1] + (CYAN[1] - PURPLE[1]) * mix, PURPLE[2] + (CYAN[2] - PURPLE[2]) * mix, 1]
}

const spinnerStroke =(size) => Math.min(7, Math.max(2.5, size * 0.08))

export const spinnerArc = (size) =>
  once('arc' + size, () => {
    const strokeWidth = spinnerStroke(size)
    const canvas = canvasOf(size, size)
    const ctx = canvas.getContext('2d')
    const center = size / 2
    const radius = (size - strokeWidth) / 2
    const half = strokeWidth / 2
    const tailX = center + radius
    const tailY = center
    const headX = center + radius * Math.cos(SWEEP)
    const headY = center + radius * Math.sin(SWEEP)
    const image = ctx.createImageData(size, size)
    const data = image.data
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - center
        const dy = y + 0.5 - center
        let angle = Math.atan2(dy, dx)
        if (angle < 0) angle += Math.PI * 2
        const t = angle / SWEEP
        let coverage = 0
        if (t <= 1) coverage = half - Math.abs(Math.sqrt(dx * dx + dy * dy) - radius) + 0.5
        const toTail = half - Math.sqrt((x + 0.5 - tailX) * (x + 0.5 - tailX) + (y + 0.5 - tailY) * (y + 0.5 - tailY)) + 0.5
        const toHead = half - Math.sqrt((x + 0.5 - headX) * (x + 0.5 - headX) + (y + 0.5 - headY) * (y + 0.5 - headY)) + 0.5
        coverage = Math.min(1, Math.max(0, coverage, toTail, toHead))
        if (coverage <= 0) continue
        const color = arcColor(t)
        const i = (y * size + x) * 4
        data[i] = color[0]
        data[i + 1] = color[1]
        data[i + 2] = color[2]
        data[i + 3] = color[3] * coverage * 255
      }
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/png')
  })

// The spinner's track: a ring of the stroke's width in white at 0.118.
export const spinnerTrack = (size) =>
  once('track' + size, () => {
    const w = spinnerStroke(size)
    const canvas = canvasOf(size, size)
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.arc(size / 2, size / 2, size / 2 - w, 0, Math.PI * 2, true)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.118)'
    ctx.fill()
    return canvas.toDataURL('image/png')
  })

const SAMPLES = 48
export const MOON_FRAMES = 72
const MOON_COLS = 12
const PALETTES = {
  natural: {
    glow: 'rgba(56, 189, 248, 0.118)',
    base: [[0, '#0f172a'], [1, '#020617']],
    lit: [[0, '#ffffff'], [0.4, '#f8fafc'], [0.75, '#e2e8f0'], [1, '#cbd5e1']],
    rim: 'rgba(255, 255, 255, 0.176)',
    maria: true,
  },
  moonfin: {
    glow: 'rgba(0, 164, 220, 0.118)',
    base: [[0, '#0e1118'], [1, '#000000']],
    lit: [[0.1, '#aa5cc3'], [0.2, '#9c62c5'], [0.4, '#7672cb'], [0.66, '#3a8cd4'], [0.9, '#00a4dc']],
    litLinear: true,
    rim: 'rgba(0, 164, 220, 0.157)',
  },
  neonfin: {
    glow: 'rgba(255, 46, 146, 0.118)',
    base: [[0, '#66f0ff'], [0.4, '#00e5ff'], [0.8, '#00b8cc'], [1, '#008fa0']],
    lit: [[0, '#ff66ad'], [0.4, '#ff2e92'], [0.8, '#d61874'], [1, '#a80a55']],
    rim: 'rgba(0, 229, 255, 0.196)',
  },
}

const gradient = (ctx, stops, linear, cx, cy, radius) => {
  const shade = linear
    ? ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius)
    : ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.25, 0, cx - radius * 0.25, cy - radius * 0.25, radius * 1.8)
  stops.forEach((s) => shade.addColorStop(s[0], s[1]))
  return shade
}

// Canvas can't blur a shape, but it can blur a shadow, so the shape is drawn far off to the side
// and only its shadow, cast back onto the spot, is left to see.
const BLUR_THROW = 10000
const blurred = (ctx, sigma, color, draw) => {
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = sigma * 2
  ctx.shadowOffsetX = BLUR_THROW
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.translate(-BLUR_THROW, 0)
  draw()
  ctx.restore()
}

const oval = (ctx, x, y, width, height) => {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(width / 2, height / 2)
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.restore()
  ctx.fill()
}

const drawMaria = (ctx, cx, cy, r, lit) => {
  blurred(ctx, r * 0.12, lit ? 'rgba(100, 116, 139, 0.216)' : 'rgba(0, 0, 0, 0.353)', () => {
    oval(ctx, cx - r * 0.28, cy - r * 0.3, r * 0.44, r * 0.38)
    oval(ctx, cx - r * 0.45, cy + r * 0.05, r * 0.38, r * 0.55)
    oval(ctx, cx + r * 0.22, cy - r * 0.24, r * 0.34, r * 0.3)
    oval(ctx, cx + r * 0.32, cy - r * 0.02, r * 0.38, r * 0.32)
    oval(ctx, cx + r * 0.36, cy + r * 0.22, r * 0.28, r * 0.24)
    oval(ctx, cx + r * 0.54, cy - r * 0.14, r * 0.18, r * 0.14)
    oval(ctx, cx - r * 0.16, cy + r * 0.34, r * 0.36, r * 0.3)
  })
  if (!lit) return
  const tychoX = cx - r * 0.08
  const tychoY = cy + r * 0.52
  const copernicusX = cx - r * 0.22
  const copernicusY = cy - r * 0.08
  blurred(ctx, 1, 'rgba(255, 255, 255, 0.137)', () => {
    ctx.lineWidth = Math.min(1.5, Math.max(0.5, 0.8 * (r / 50)))
    ;[[-0.25, -0.2], [0.28, -0.22], [-0.05, -0.35]].forEach((d) => {
      ctx.beginPath()
      ctx.moveTo(tychoX, tychoY)
      ctx.lineTo(tychoX + r * d[0], tychoY + r * d[1])
      ctx.stroke()
    })
  })
  ctx.fillStyle = 'rgba(255, 255, 255, 0.824)'
  ctx.beginPath()
  ctx.arc(tychoX, tychoY, r * 0.035, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(copernicusX, copernicusY, r * 0.03, 0, Math.PI * 2)
  ctx.fill()
}

const tracePhase = (ctx, phase, cx, cy, r) => {
  const cosT = Math.cos(phase * 2 * Math.PI)
  const waxing = phase < 0.5
  ctx.beginPath()
  for (let i = 0; i <= SAMPLES; i++) {
    const y = -r + (2 * r * i) / SAMPLES
    const w = Math.sqrt(Math.max(0, r * r - y * y))
    const x = waxing ? w : -w
    if (i === 0) ctx.moveTo(cx + x, cy + y)
    else ctx.lineTo(cx + x, cy + y)
  }
  for (let i = SAMPLES; i >= 0; i--) {
    const y = -r + (2 * r * i) / SAMPLES
    const w = Math.sqrt(Math.max(0, r * r - y * y))
    ctx.lineTo(cx + (waxing ? w * cosT : -w * cosT), cy + y)
  }
  ctx.closePath()
}

// The glow, which reaches past the moon's own square, the night side and its seas, on a canvas
// twice the moon's size drawn size / 2 up and left of it.
export const moonBackdrop = (size, paletteName) =>
  once('moonback' + size + paletteName, () => {
    const palette = PALETTES[paletteName]
    const canvas = canvasOf(size * 2, size * 2)
    const ctx = canvas.getContext('2d')
    const center = canvas.width / 2
    const r = size * 0.4
    blurred(ctx, r * 0.4, palette.glow, () => {
      ctx.beginPath()
      ctx.arc(center, center, r * 1.12, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.fillStyle = gradient(ctx, palette.base, false, center, center, r)
    ctx.beginPath()
    ctx.arc(center, center, r, 0, Math.PI * 2)
    ctx.fill()
    if (palette.maria) drawMaria(ctx, center, center, r, false)
    return canvas.toDataURL('image/png')
  })

// The lit side at MOON_FRAMES even steps of the phase, new through full and back, with the rim.
export const moonPhases = (size, paletteName) =>
  once('moonphase' + size + paletteName, () => {
    const palette = PALETTES[paletteName]
    const rows = Math.ceil(MOON_FRAMES / MOON_COLS)
    const sheet = canvasOf(MOON_COLS * size, rows * size)
    const out = sheet.getContext('2d')
    const cell = canvasOf(size, size)
    const ctx = cell.getContext('2d')
    const center = size / 2
    const r = size * 0.4
    const litShade = gradient(ctx, palette.lit, palette.litLinear, center, center, r)
    const rimWidth = Math.min(2, Math.max(0.8, 1.4 * (size / 100)))
    let litMaria = null
    if (palette.maria) {
      litMaria = canvasOf(size, size)
      drawMaria(litMaria.getContext('2d'), center, center, r, true)
    }
    const frames = {}
    for (let f = 0; f < MOON_FRAMES; f++) {
      ctx.clearRect(0, 0, size, size)
      tracePhase(ctx, f / MOON_FRAMES, center, center, r)
      ctx.fillStyle = litShade
      ctx.fill()
      if (litMaria) {
        ctx.save()
        ctx.clip()
        ctx.drawImage(litMaria, 0, 0)
        ctx.restore()
      }
      ctx.strokeStyle = palette.rim
      ctx.lineWidth = rimWidth
      ctx.beginPath()
      ctx.arc(center, center, r, 0, Math.PI * 2)
      ctx.stroke()
      const x = (f % MOON_COLS) * size
      const y = Math.floor(f / MOON_COLS) * size
      out.drawImage(cell, x, y)
      frames[f] = { x, y, w: size, h: size }
    }
    return { src: sheet.toDataURL('image/png'), map: { frames } }
  })

// The label: bold capitals in the browser's Roboto with the letter spacing after
// every character, filled with the Moonfin gradient across its own box, on a line-height: normal
// line. `face` is a loaded Roboto Bold FontFace family.
export const labelImage = (text, size, spacing, face) =>
  once('label' + text + size + spacing + face, () => {
    const measure = canvasOf(1, 1).getContext('2d')
    measure.font = `${size}px ${face}, sans-serif`
    const w = measure.measureText(text).width + spacing * text.length
    const h = normalLine(size)
    const canvas = canvasOf(w, h)
    const ctx = canvas.getContext('2d')
    ctx.font = measure.font
    ctx.textBaseline = 'alphabetic'
    const fill = ctx.createLinearGradient(0, 0, w, 0)
    fill.addColorStop(0, '#aa5cc3')
    fill.addColorStop(1, '#00a4dc')
    ctx.fillStyle = fill
    // Each letter at the width of the run before it, so kerning stays as CSS has it.
    const baseline = Math.round(0.927734 * size)
    for (let i = 0; i < text.length; i++) ctx.fillText(text.charAt(i), measure.measureText(text.slice(0, i)).width + spacing * i, baseline)
    return { src: canvas.toDataURL('image/png'), w, h }
  })
