// The screensaver's running stick figure, drawn with canvas code. The renderer can't run a canvas
// per frame cheaply, so one stride is baked once into a sprite sheet: FRAMES frames facing right,
// then the same frames facing left.
const LEAD_COLOR = '#00A4DC'
const TRAIL_COLOR = '#AA5CC3'
const HEAD_COLOR = '#ffffff'
export const STRIDE_DURATION = 620
export const FRAMES = 30
const COLS = 10

const stroke = (ctx, x1, y1, x2, y2) => {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

const drawLeg = (ctx, hipX, hipY, phase, scale) => {
  const s = Math.sin(phase)
  const c = Math.cos(phase)
  const thighLen = 18 * scale
  const calfLen = 17 * scale
  const thighAngle = 0.75 * s - 0.15
  const kneeX = hipX + thighLen * Math.sin(thighAngle)
  const kneeY = hipY + thighLen * Math.cos(thighAngle)
  // The knee folds hard on the recovery so the heel kicks up, then opens out again for the foot strike.
  const calfAngle = thighAngle - (0.85 - 0.75 * s + 0.35 * c)
  stroke(ctx, hipX, hipY, kneeX, kneeY)
  stroke(ctx, kneeX, kneeY, kneeX + calfLen * Math.sin(calfAngle), kneeY + calfLen * Math.cos(calfAngle))
}

const drawArm = (ctx, shoulderX, shoulderY, phase, scale) => {
  // Arms pump against the legs, so the swing runs half a stride behind.
  const s = Math.sin(phase + Math.PI)
  const upperArmLen = 14 * scale
  const foreArmLen = 13 * scale
  const alpha = 0.8 * s - 0.1
  const elbowX = shoulderX + upperArmLen * Math.sin(alpha)
  const elbowY = shoulderY + upperArmLen * Math.cos(alpha)
  const foreArmAngle = alpha + (1.48 - 0.12 * s)
  stroke(ctx, shoulderX, shoulderY, elbowX, elbowY)
  stroke(ctx, elbowX, elbowY, elbowX + foreArmLen * Math.sin(foreArmAngle), elbowY + foreArmLen * Math.cos(foreArmAngle))
}

// It doesn't clear the canvas, since After Hours also paints the runner into a game frame.
export const drawRunner = (ctx, size, progress, facingLeft) => {
  const scale = size / 100
  const strokeWidth = Math.max(3, Math.min(9.5, 6.5 * scale))
  ctx.save()
  if (facingLeft) {
    ctx.translate(size, 0)
    ctx.scale(-1, 1)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const phi = progress * 2 * Math.PI
  const bounce = Math.sin(phi * 2) * 2.8 * scale
  const hipX = 42 * scale
  const hipY = 52 * scale + bounce
  const shoulderX = hipX + 16 * scale
  const shoulderY = 28 * scale + bounce
  ctx.strokeStyle = TRAIL_COLOR
  ctx.lineWidth = strokeWidth * 0.92
  drawLeg(ctx, hipX, hipY, phi + Math.PI, scale)
  drawArm(ctx, shoulderX, shoulderY, phi, scale)
  ctx.strokeStyle = LEAD_COLOR
  ctx.lineWidth = strokeWidth * 1.05
  stroke(ctx, hipX, hipY, shoulderX, shoulderY)
  ctx.fillStyle = HEAD_COLOR
  ctx.beginPath()
  ctx.arc(shoulderX + 5 * scale, shoulderY - 12 * scale, 7.5 * scale, 0, 2 * Math.PI)
  ctx.fill()
  ctx.lineWidth = strokeWidth
  drawLeg(ctx, hipX, hipY, phi, scale)
  drawArm(ctx, shoulderX, shoulderY, phi + Math.PI, scale)
  ctx.restore()
}

const sheets = {}

// { src, map } for spriteFrames(): frame f faces right, frame FRAMES + f faces left. Each frame is
// drawn on a canvas the size of the figure, which clips it.
export const runnerSheet = (size) => {
  if (sheets[size]) return sheets[size]
  const rows = Math.ceil(FRAMES / COLS)
  const canvas = document.createElement('canvas')
  canvas.width = COLS * size
  canvas.height = rows * 2 * size
  const ctx = canvas.getContext('2d')
  const cell = document.createElement('canvas')
  cell.width = size
  cell.height = size
  const cellCtx = cell.getContext('2d')
  const frames = {}
  for (let facing = 0; facing < 2; facing++) {
    for (let f = 0; f < FRAMES; f++) {
      const x = (f % COLS) * size
      const y = (facing * rows + Math.floor(f / COLS)) * size
      cellCtx.clearRect(0, 0, size, size)
      drawRunner(cellCtx, size, f / FRAMES, facing === 1)
      ctx.drawImage(cell, x, y)
      frames[facing * FRAMES + f] = { x, y, w: size, h: size }
    }
  }
  sheets[size] = { src: canvas.toDataURL('image/png'), map: { frames } }
  return sheets[size]
}
