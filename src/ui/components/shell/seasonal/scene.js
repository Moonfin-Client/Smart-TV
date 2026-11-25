// Draws the particles from buildSeasonalParticles as renderer nodes and moves them along their
// keyframes. One clock samples every keyframe track per frame and sets the nodes directly, outside
// Solid, since that's the cheapest way the renderer offers to move a few dozen nodes.
import { progress, sampleAll } from './keyframes.js'

const VW = 19.2
const VH = 10.8
const DEG = Math.PI / 180

// The white shapes in public/seasonal, rasterized at this size, with `pad` px of clear border or
// overflow (a leaf's vein, a bauble's cap, a spark's glow) on every side. The border lets the
// renderer's filtering smooth the edges of a turned shape.
const TEXTURES = {
  dot: [28, 28, 1],
  flake: [34, 34, 1],
  leaf: [28, 28, 2],
  leafMirror: [28, 28, 2],
  petal: [24, 32, 1],
  petalHi: [24, 32, 1],
  disc: [26, 26, 1],
  strip: [24, 13, 1],
  baubleHi: [26, 26, 4],
  star: [26, 26, 1],
  paleStar: [20, 20, 1],
  blossom: [36, 36, 1],
  candy: [30, 30, 1],
  heart: [26, 26, 1],
  egg: [28, 28, 1],
  ember: [22, 22, 1],
  glow: [32, 32, 1],
  flash: [128, 128, 1],
  bat: [48, 30, 1],
  bee: [30, 30, 1],
  ghost: [52, 52, 1],
  rocket: [4, 76, 1],
  spark: [11, 11, 9],
  lantern: [64, 64, 0],
}

export const tintOf = (hex, alpha = 1) => ((parseInt(hex.slice(1), 16) << 8) | Math.round(alpha * 255)) >>> 0
const CLEAR = 0x00000000
const WHITE = 0xffffffff

const list = (value) => String(value).split(',').map((part) => parseFloat(part))
const vh = (value) => parseFloat(value) * VH
const padOf = (name, w, h) => {
  const [tw, th, pad] = TEXTURES[name]
  return [(pad * w) / tw, (pad * h) / th]
}

// A node drawing `name` over a CSS box w x h, turning about pivot (fractions of that box). Its x
// and y go `ox`, `oy` up and left of the box's, for the texture's border.
const shape = (stage, parent, name, w, h, props = {}) => {
  const [ox, oy] = padOf(name, w, h)
  const pivotX = props.pivotX === undefined ? 0.5 : props.pivotX
  const pivotY = props.pivotY === undefined ? 0.5 : props.pivotY
  const node = stage.createNode({
    color: WHITE,
    ...props,
    parent,
    x: (props.x || 0) - ox,
    y: (props.y || 0) - oy,
    w: w + 2 * ox,
    h: h + 2 * oy,
    pivotX: (ox + pivotX * w) / (w + 2 * ox),
    pivotY: (oy + pivotY * h) / (h + 2 * oy),
    src: `seasonal/${name}.webp`,
  })
  node.ox = ox
  node.oy = oy
  return node
}

// A second texture over a shape's box, as its child.
const overlay = (stage, under, underName, name, w, h) => {
  const [ox, oy] = padOf(underName, w, h)
  const [px, py] = padOf(name, w, h)
  return stage.createNode({ parent: under, x: ox - px, y: oy - py, w: w + 2 * px, h: h + 2 * py, src: `seasonal/${name}.webp` })
}

const TEXTURE_OF = { bauble: 'disc', firefly: 'glow' }

// The node a falling particle moves, over its CSS box, with what it draws inside.
const fallingNode = (stage, root, p) => {
  const w = vh(p.style.width)
  const h = vh(p.style.height)
  const name = TEXTURE_OF[p.shape] || p.shape
  // Leaves swing from a point above them.
  const leaf = p.shape === 'leaf' || p.shape === 'leafMirror'
  const node = shape(stage, root, name, w, h, { color: p.tint ? tintOf(p.tint) : WHITE, pivotY: leaf ? -0.6 : 0.5 })
  if (p.shape === 'petal') overlay(stage, node, 'petal', 'petalHi', w, h)
  if (p.shape === 'bauble') overlay(stage, node, 'disc', 'baubleHi', w, h)
  return node
}

const FALL_PATH = /^([a-z]+?)(Flicker|Twinkle)?(\d)$/

const buildFalling = (stage, root, p) => {
  const st = p.style
  const [duration, pulseSeconds] = list(st.animationDuration)
  const [delay, pulseDelay] = list(st.animationDelay)
  const m = FALL_PATH.exec(p.path)
  const firefly = p.shape === 'firefly'
  const node = fallingNode(stage, root, p)
  return {
    node,
    anim: firefly ? p.path : m[1] + m[3],
    pulse: m && m[2] ? m[2].toLowerCase() : null,
    left: parseFloat(st.left) * VW - node.ox,
    top: (firefly ? parseFloat(st.top) * VH : 0) - node.oy,
    opacity: st.opacity == null ? 1 : st.opacity,
    glow: p.glow == null ? 1 : p.glow,
    firefly,
    duration,
    delay,
    pulseSeconds,
    pulseDelay,
  }
}

const MOTIONS = { bat: 'batFlap', beeRight: 'beeBuzzRight', beeLeft: 'beeBuzzLeft', ghost: 'ghostFloat' }

const buildFlyer = (stage, root, f) => {
  const node = stage.createNode({ parent: root, w: 0, h: 0, color: CLEAR })
  const name = f.sprite.indexOf('bee') === 0 ? 'bee' : f.sprite
  const sprite = shape(stage, node, name, vh(f.spriteStyle.width), vh(f.spriteStyle.height), {
    alpha: f.sprite === 'ghost' ? 0.85 : 1,
    pivotY: f.sprite === 'bat' ? 0.4 : 0.5,
  })
  return {
    node,
    sprite,
    anim: f.path,
    motion: MOTIONS[f.sprite],
    top: parseFloat(f.style.top) * VH,
    duration: list(f.style.animationDuration)[0],
    delay: list(f.style.animationDelay)[0],
    motionSeconds: list(f.spriteStyle.animationDuration)[0],
    motionDelay: list(f.spriteStyle.animationDelay)[0],
  }
}

const RING = 15 * VH

const buildBurst = (stage, root, b) => {
  const mover = stage.createNode({ parent: root, w: 0, h: 0, color: CLEAR })
  const rocket = shape(stage, mover, 'rocket', 0.36 * VH, 7 * VH, { x: -0.18 * VH, alpha: 0 })
  const flash = shape(stage, mover, 'flash', 24 * VH, 24 * VH, { x: -12 * VH, y: -12 * VH, color: tintOf(b.tint, 0.9), alpha: 0 })
  const ring = stage.createNode({ parent: mover, x: -RING, y: -RING, w: RING * 2, h: RING * 2, color: CLEAR, alpha: 0 })
  b.sparks.forEach((s) => {
    const size = vh(s.style.width)
    const x = (parseFloat(s.style.left) / 100) * RING * 2 - size / 2
    const y = (parseFloat(s.style.top) / 100) * RING * 2 - size / 2
    shape(stage, ring, 'spark', size, size, { x, y, color: tintOf(s.tint) })
  })
  return {
    mover,
    rocket,
    flash,
    ring,
    anim: b.mover,
    moverSeconds: list(b.moverStyle.animationDuration)[0],
    seconds: list(b.partStyle.animationDuration)[0],
    delay: list(b.partStyle.animationDelay)[0],
  }
}

// Scratch objects the samplers fill, so a frame allocates nothing.
const kf = {}
const pulse = {}
const motion = {}
const part = {}

// Builds the nodes for `particles` under `root` and returns update(t), t in seconds on the
// particles' clock, and destroy().
export const buildScene = (stage, root, particles) => {
  // Falling particles draw one texture after the other rather than in the order they were made, so
  // a screen of snow is a draw or two where every change of texture used to start another. Only
  // particles of different textures and colors that cross could show the change.
  const groups = {}
  const groupOf = (p) => {
    const name = TEXTURE_OF[p.shape] || p.shape
    if (!groups[name]) groups[name] = stage.createNode({ parent: root, w: 0, h: 0, color: CLEAR })
    return groups[name]
  }
  const falling = particles.falling.map((p) => buildFalling(stage, groupOf(p), p))
  const flyers = particles.flyers.map((f) => buildFlyer(stage, root, f))
  const bursts = particles.bursts.map((b) => buildBurst(stage, root, b))

  const update = (t) => {
    for (let i = 0; i < falling.length; i++) {
      const p = falling[i]
      const n = p.node
      sampleAll(p.anim, progress(t, p.duration, p.delay), kf)
      n.x = p.left + kf.x * VW
      n.y = p.top + kf.y * VH
      if (kf.r !== undefined) n.rotation = kf.r * DEG
      if (kf.s !== undefined) n.scaleY = kf.s
      if (p.firefly) n.alpha = kf.o
      else if (p.pulse) n.alpha = p.glow * sampleAll(p.pulse, progress(t, p.pulseSeconds, p.pulseDelay, true), pulse).o
      else n.alpha = p.opacity
      kf.r = undefined
      kf.s = undefined
    }
    for (let i = 0; i < flyers.length; i++) {
      const f = flyers[i]
      sampleAll(f.anim, progress(t, f.duration, f.delay), kf)
      f.node.x = kf.x * VW
      f.node.y = f.top + kf.y * VH
      const m = sampleAll(f.motion, progress(t, f.motionSeconds, f.motionDelay, true), motion)
      if (f.motion === 'batFlap') f.sprite.scaleY = m.sy
      else {
        f.sprite.y = m.y * VH - f.sprite.oy
        f.sprite.rotation = m.r * DEG
      }
    }
    for (let i = 0; i < bursts.length; i++) {
      const b = bursts[i]
      sampleAll(b.anim, progress(t, b.moverSeconds, b.delay), part)
      b.mover.x = part.x * VW
      b.mover.y = part.y * VH
      const p = progress(t, b.seconds, b.delay)
      sampleAll('rocketRise', p, part)
      b.rocket.alpha = part.o
      b.rocket.y = part.y * VH - b.rocket.oy
      sampleAll('burstFlash', p, part)
      b.flash.alpha = part.o
      b.flash.scale = part.sc
      sampleAll('burstRing', p, part)
      b.ring.alpha = part.o
      b.ring.y = -RING + part.y * VH
      b.ring.scale = part.sc
    }
  }

  const destroy = () => {
    falling.forEach((p) => p.node.destroy())
    Object.keys(groups).forEach((name) => groups[name].destroy())
    flyers.forEach((f) => f.node.destroy())
    bursts.forEach((b) => b.mover.destroy())
  }

  return { update, destroy, count: falling.length + flyers.length + bursts.length }
}

