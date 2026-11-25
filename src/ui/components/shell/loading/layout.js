// The loading animation's size, speed and position tables, and where each position puts the
// overlay on a 1920x1080 screen.
export const SIZE_LAYOUT = {
  thumbnail: { pixelSize: 36, labelSpacing: 8, labelFontSize: 10, labelLetterSpacing: 1.5 },
  small: { pixelSize: 64, labelSpacing: 14, labelFontSize: 12, labelLetterSpacing: 2.5 },
  medium: { pixelSize: 110, labelSpacing: 24, labelFontSize: 14, labelLetterSpacing: 3.5 },
  large: { pixelSize: 170, labelSpacing: 40, labelFontSize: 16, labelLetterSpacing: 4 },
}

export const SPEED_MULTIPLIER = { slow: 0.45, moderate: 0.7, fast: 1.0, ultra: 1.6 }

// Where each position anchors the animation, with -1 and 1 as the two edges, and how far it keeps
// from them, as CSS padding: top, right, bottom, left.
export const POSITION_LAYOUT = {
  topLeft: { x: -1, y: -1, padding: [40, 40, 40, 40] },
  topCenter: { x: 0, y: -1, padding: [40, 24, 0, 24] },
  topRight: { x: 1, y: -1, padding: [40, 40, 40, 40] },
  middleLeft: { x: -1, y: 0, padding: [24, 0, 24, 40] },
  middle: { x: 0, y: 0, padding: [0, 0, 0, 0] },
  middleRight: { x: 1, y: 0, padding: [24, 40, 24, 0] },
  bottomLeft: { x: -1, y: 1, padding: [40, 40, 40, 40] },
  bottomCenter: { x: 0, y: 1, padding: [0, 24, 40, 24] },
  bottomRight: { x: 1, y: 1, padding: [40, 40, 40, 40] },
  bouncing: { x: 0, y: 0, padding: [0, 0, 0, 0] },
}

export const MOON_PALETTES = { moonPhases: 'natural', moonfinPhases: 'moonfin', neonfinPhases: 'neonfin' }

export const sizeLayout = (size) => SIZE_LAYOUT[size] || SIZE_LAYOUT.medium
export const speedMultiplier = (speed) => SPEED_MULTIPLIER[speed] || SPEED_MULTIPLIER.fast
const positionLayout =(position) => POSITION_LAYOUT[position] || POSITION_LAYOUT.middle

// A runner on the right hand side turns to run toward the middle.
export const facesLeft = (position) => positionLayout(position).x === 1

// The top left of a w by h overlay held in its padded box and pushed to the anchor's edge.
export const anchoredAt = (position, w, h, screenW = 1920, screenH = 1080) => {
  const l = positionLayout(position)
  const [top, right, bottom, left] = l.padding
  const edge = (side, lead, trail, span, size) => (side < 0 ? lead : side > 0 ? span - trail - size : (span - lead - trail - size) / 2 + lead)
  return { x: edge(l.x, left, right, screenW, w), y: edge(l.y, top, bottom, screenH, h) }
}

// The bouncing position: a drift over the area 40px in that turns off the walls. The two speeds
// don't divide evenly, so it wanders rather than repeating a short loop. `m` is mutated, dt in ms.
const BOUNCE_PADDING = 40
export const bounceStart = () => ({ x: -0.5, y: -0.3, vx: 0.42, vy: 0.54 })
export const bounceStep = (m, dtMs, speed) => {
  const dt = Math.min(0.05, dtMs / 1000)
  m.x += m.vx * dt * speed
  m.y += m.vy * dt * speed
  if (m.x >= 1) {
    m.x = 1
    m.vx = -Math.abs(m.vx)
  } else if (m.x <= -1) {
    m.x = -1
    m.vx = Math.abs(m.vx)
  }
  if (m.y >= 1) {
    m.y = 1
    m.vy = -Math.abs(m.vy)
  } else if (m.y <= -1) {
    m.y = -1
    m.vy = Math.abs(m.vy)
  }
  return m
}
export const bounceAt = (m, w, h, screenW = 1920, screenH = 1080) => {
  const areaW = screenW - BOUNCE_PADDING * 2
  const areaH = screenH - BOUNCE_PADDING * 2
  return {
    x: BOUNCE_PADDING + Math.round(((m.x + 1) / 2) * (areaW - w)),
    y: BOUNCE_PADDING + Math.round(((m.y + 1) / 2) * (areaH - h)),
  }
}
