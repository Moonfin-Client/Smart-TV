// The drawing that follows focus on Home for some seasonal effects, drawn with renderer nodes. It
// glides to each new spot on a 0.45s curve, fades on 0.35s, swings or tilts after a move, and the
// sparkler, diya and lantern keep their crackle, flicker and glow.
import { EASE, ONE_SHOT_SECONDS, progress, sampleAll } from './keyframes.js'
import { tintOf } from './scene.js'

const DEG = Math.PI / 180
const CLEAR = 0x00000000
const GLIDE_S = 0.45
const FADE_S = 0.35
const RAINBOW_BASE = 100

// Each drawing's box from its anchor, [left, top, width, height].
const DRAWINGS = {
  planchette: [-46.5, -46.5, 93, 93],
  cupidArrow: [-57, -57, 114, 114],
  sparkler: [-40, -40, 80, 80],
  sleigh: [-60, -65.3, 120, 120],
  bunnyEars: [-40, -73.3, 80, 80],
  easterEgg: [-35, -61.1, 70, 70],
  lantern: [-45, -6.7, 90, 90],
  diya: [-43.5, -75.9, 87, 87],
}
// The live parts: [left, top, width, height, pivotY, keyframes, seconds, alternate].
const PARTS = {
  lanternGlow: [-44.5, -6.9, 89, 89, 0.5, 'glowPulse', 1.43, true],
  sparks: [-44, -72, 88, 88, 0.5, 'sparksCrackle', 0.48, false],
  flame: [-1.6, -67.7, 62, 62, 0.61, 'flameFlicker', 0.9, false],
}

// A CSS transition on a few numbers: from where they are now to `to`, on `ease`.
const tween = (values, ease = EASE.glide) => ({ from: values, to: values, start: 0, seconds: 0, ease })
const retarget = (tw, to, now, seconds) => {
  tw.from = current(tw, now)
  tw.to = to
  tw.start = now
  tw.seconds = seconds
}
const current = (tw, now) => {
  if (!tw.seconds) return tw.to
  const u = Math.min(1, (now - tw.start) / tw.seconds)
  if (u >= 1) return tw.to
  const e = tw.ease(u)
  return tw.from.map((v, i) => v + (tw.to[i] - v) * e)
}

// The drawings load with the layer still clear and fade in and out with focus, so they're fetched at
// once and kept rather than loaded on first show and dropped when hidden.
const ART = { preload: true, preventCleanup: true }

const node = (stage, parent, props) => stage.createNode({ parent, color: CLEAR, w: 0, h: 0, ...props })

const buildDrawing = (stage, root, kind) => {
  const layer = node(stage, root, { alpha: 0 })
  const glider = node(stage, layer, {})
  const sway = node(stage, glider, {})
  const parts = []
  const add = (name, [x, y, w, h, pivotY, anim, seconds, alternate]) => {
    const n = stage.createNode({ parent: sway, x, y, w, h, src: `seasonal/follower-${name}.webp`, pivotY: pivotY || 0.5, textureOptions: ART })
    if (anim) parts.push({ n, anim, seconds, alternate })
    return n
  }
  if (kind === 'lantern') add('lantern-glow', PARTS.lanternGlow)
  const drawing = add(kind, DRAWINGS[kind])
  // The sleigh flies left in a drawing of its own.
  const left = kind === 'sleigh' ? add('sleigh-left', DRAWINGS.sleigh) : null
  if (left) left.alpha = 0
  if (kind === 'sparkler') add('sparks', PARTS.sparks)
  if (kind === 'diya') add('flame', PARTS.flame)
  return { kind, layer, glider, sway, drawing, left, parts, pos: tween([0, 0, 0]), fade: tween([0], EASE.linear), swing: null, facing: 1 }
}

const buildRainbow = (stage, root) => {
  const layer = node(stage, root, { alpha: 0 })
  const bar = stage.createNode({ parent: layer, w: RAINBOW_BASE, h: 0, src: 'seasonal/rainbow.webp', textureOptions: ART })
  const start = stage.createNode({ parent: layer, src: 'seasonal/disc.webp', color: tintOf('#e40303'), textureOptions: ART })
  const end = stage.createNode({ parent: layer, src: 'seasonal/disc.webp', color: tintOf('#750787'), textureOptions: ART })
  // [x, y, reach, thickness]
  return { kind: 'rainbow', layer, bar, start, end, pos: tween([0, 0, 0, 0]), fade: tween([0], EASE.linear) }
}

export const buildFollowers = (stage, root, kinds) => kinds.map((kind) => (kind === 'rainbow' ? buildRainbow(stage, root) : buildDrawing(stage, root, kind)))

// Moves follower `f` to `place` (from placeFollower) at `now` seconds.
export const applyPlace = (f, place, prev, now) => {
  if (place.shown !== prev.shown) retarget(f.fade, [place.shown ? 1 : 0], now, FADE_S)
  if (!place.shown) return
  const to = f.kind === 'rainbow' ? [place.x, place.y, Math.max(0, place.width - place.thickness) / 2, place.thickness] : [place.x, place.y, place.angle]
  // It appears where it lands rather than gliding over from its last spot.
  if (place.glide) retarget(f.pos, to, now, GLIDE_S)
  else f.pos = tween(to)
  if (f.kind === 'rainbow') return
  if (f.left && place.facing !== f.facing) {
    f.facing = place.facing
    f.drawing.alpha = place.facing < 0 ? 0 : 1
    f.left.alpha = place.facing < 0 ? 1 : 0
  }
  if (place.move !== prev.move) f.swing = place.swing ? { anim: place.swing, start: now } : null
}

export const drawFollower = (f, now) => {
  f.layer.alpha = current(f.fade, now)[0]
  if (f.kind === 'rainbow') {
    const [x, y, reach, thickness] = current(f.pos, now)
    const radius = thickness / 2
    f.bar.h = thickness
    f.bar.x = x - RAINBOW_BASE / 2
    f.bar.y = y - radius
    f.bar.scaleX = (reach * 2) / RAINBOW_BASE
    f.start.w = f.start.h = f.end.w = f.end.h = thickness
    f.start.x = x - reach - radius
    f.end.x = x + reach - radius
    f.start.y = f.end.y = y - radius
    return
  }
  const [x, y, angle] = current(f.pos, now)
  f.glider.x = x
  f.glider.y = y
  f.glider.rotation = angle * DEG
  let r = 0
  if (f.swing) {
    const p = progress(now - f.swing.start, ONE_SHOT_SECONDS[f.swing.anim], 0, false, true)
    if (p === null) f.swing = null
    else r = sampleAll(f.swing.anim, p, {}).r
  }
  f.sway.rotation = r * DEG
  for (let i = 0; i < f.parts.length; i++) {
    const part = f.parts[i]
    const v = sampleAll(part.anim, progress(now, part.seconds, 0, part.alternate), {})
    part.n.alpha = v.o
    if (v.sc !== undefined) part.n.scale = v.sc
    if (v.sy !== undefined) part.n.scaleY = v.sy
    if (v.r !== undefined) part.n.rotation = v.r * DEG
  }
}

export const destroyFollowers = (list) => list.forEach((f) => f.layer.destroy())
